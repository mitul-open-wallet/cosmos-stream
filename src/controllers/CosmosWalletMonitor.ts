import WebSocket from "ws";
import amqp from 'amqplib';
import { CosmosResponse } from "../models/model";
import { EventAttribute } from "../models/model";
import { TransferOperation } from "../models/model";
import { QueuePayload } from "../models/model";
import { appConfig } from "../config";
import { TipReceiverItem } from "../models/model";
import { it } from "node:test";

export class CosmosWalletMonitor {

    private cosmosHubWebSocketEndpoint: string;
    private websocket: WebSocket | undefined = undefined;
    private rabbitMqChannel: amqp.Channel | undefined = undefined
    private rabbitMqConnection: amqp.Connection | undefined = undefined
    private reconnectTimer: NodeJS.Timeout | undefined = undefined

    private maxReconnectionDelay: number = 30000
    private initialReconnectionDelay = 1000
    private reconnectAttempts = 0
    private isShuttingDown = false
    private isConnecting = false

    constructor(cosmosHubWebSocketEndpoint: string, private rabbitMqUrl: string = appConfig.rabbitMqUrl) {
        this.cosmosHubWebSocketEndpoint = cosmosHubWebSocketEndpoint
    }

    async bootstrap(): Promise<void> {
        await this.start()
        await this.setupRabbitMq()
    }

    private async start(): Promise<void> {
        if (this.isConnecting) {
            return Promise.resolve()
        }
        this.isConnecting = true
        return new Promise((resolve, reject) => {
            try {
                this.websocket = new WebSocket(
                    this.cosmosHubWebSocketEndpoint
                )
                this.websocket.on('open', () => {
                    this.isConnecting = false
                    console.log("Connected")
                    this.susbscribeToEvent()
                    resolve()
                })
                this.websocket.on('close', (code, reason) => {
                    console.log("Closed")
                    if (this.isShuttingDown === false) {
                        this.scheduleReconnect()
                    }
                })
                this.websocket.on('error', (error: Error) => {
                    console.log(error)
                    if (this.reconnectAttempts === 0) {
                        reject(error)
                    }
                })
                this.websocket.on('message', (data: WebSocket.Data) => {
                    let response: CosmosResponse = JSON.parse(data.toString())
                    this.handleResponse(response)
                })
            } catch (error) {
                this.isConnecting = false
                console.error("Error establishing websocket connection", error)
                reject(error)
            }
        })
    }

    forceRestart() {
        this.websocket?.close()
        this.scheduleReconnect()
    }

    private scheduleReconnect() {
        console.log(`scheduleReconnect ${this.reconnectAttempts}`)
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer)
        }

        if (this.reconnectAttempts > this.maxReconnectionDelay) {
            console.error(`Tried ${this.reconnectAttempts} to connect web socket, but failed so giving up`)
            return
        }

        const delay = Math.min(
            this.maxReconnectionDelay * Math.pow(2, this.reconnectAttempts),
            this.maxReconnectionDelay
        )

        this.reconnectTimer = setTimeout(async () => {
            this.reconnectAttempts++
            try {
                await this.start()
            } catch (error) {
                this.scheduleReconnect()
            }
        }, delay)
    }

    private async setupRabbitMq(): Promise<void> {
        try {
            this.rabbitMqConnection = await amqp.connect(this.rabbitMqUrl)
        } catch (error) {
            console.error("rabbitmq connection error", {
                errorName: error,
                errorMessage: error
            })
        }
        this.rabbitMqConnection = await amqp.connect(this.rabbitMqUrl)
        this.rabbitMqChannel = await this.rabbitMqConnection.createChannel()
        this.rabbitMqChannel.assertExchange(appConfig.exchangeName, 'direct')
    }

    private findValue(attributes: EventAttribute[], key: string): EventAttribute | undefined {
        return attributes.find(attribute => {
            return attribute.key === key
        })
    }

    private handleResponse(response: CosmosResponse) {
        const result = response.result
        if (result) {
            const txResult = result.data?.value.TxResult
            let transactionHash = [""]
            let topLevelEvents = result.events
            if (topLevelEvents) {
                transactionHash = topLevelEvents['tx.hash']
            }
    
            if (txResult) {
                const blockHeight = txResult.height
                const events = txResult.result.events
                
                let tipPayEvents = events.filter(event => {
                    return event.type === "tip_pay"
                })
                let tipPaidAmount = tipPayEvents.map(tipPayEvent => {
                    let tipPaidAmount = this.findValue(tipPayEvent.attributes, "tip")
                    let tipPayee = this.findValue(tipPayEvent.attributes, "tip_payee")
                    if (tipPaidAmount && tipPayee) {
                        return {
                            address: tipPayee!.value,
                            amount: tipPaidAmount!.value
                        } as TipReceiverItem
                    }
                    return undefined
                })
                .filter(item => item !== undefined)
    
                
                let feePayEvents = events.filter(event => {
                    return event.type === "fee_pay"
                })
                let feeAmount = feePayEvents?.map(feeEvent => {
                 let feeAttribute = this.findValue(feeEvent.attributes, "fee")
                 return feeAttribute?.value
                })
                .filter(item => item !== undefined)
                
                let transferEvents = events.filter((event) => {
                    return event.type === "transfer"
                })
                if (events) {
                    const transferOperations = transferEvents?.map(event => {
                        let recipientAttribute = this.findValue(event.attributes, "recipient")
                        let senderAttribute = this.findValue(event.attributes, "sender")
                        let amountAttribute = this.findValue(event.attributes, "amount")
    
                        let transferOperation: TransferOperation | undefined
            
                        if (recipientAttribute && senderAttribute && amountAttribute) {
                            let decodedAmountValue = decodeBase64(amountAttribute.value)
                            let decodedReceiverVaule = decodeBase64(recipientAttribute.value)
                            let decodedSenderValue = decodeBase64(senderAttribute.value)
                            
                            let amountValue = decodedAmountValue.split(",").find(item => item.endsWith("uatom"))
                            if (amountValue) {
                                const { actualValue, unit } = this.separateValueAndUnit(amountValue)
                                transferOperation = {
                                    amount: actualValue,
                                    unit: unit,
                                    receiverAddress: decodedReceiverVaule,
                                    senderAddress: decodedSenderValue
                                }
                            } else {
                                return undefined
                            }
                        }
                        return transferOperation
                    })
                    .filter(operation => operation !== undefined)
                    let payload: QueuePayload = {
                        date: new Date(),
                        blockHeight: blockHeight,
                        txHash: transactionHash.length !== 0 ? transactionHash[0] : undefined,
                        tipReceiver: tipPaidAmount,
                        feeAmount: feeAmount.length !== 0 ? feeAmount[0] : undefined,
                        transferOperations: transferOperations
                    }
                    console.log(payload)
                    this.addMessageToChannel(payload)
                }
            }
        }
    }

    private separateValueAndUnit(input: string) {
        let value = ""
        let unit = ""
        for (let i = 0; i < input.length; i++) {
            let char = input[i]
            if (char >= '0' && char <= '9') {
                value += char
            } else {
                unit = input.substring(i)
                break
            }
        }

        let actualValue = parseInt(value, 10)

        if (isNaN(actualValue) || unit === "") {
            throw new Error("cant derive number and unit")
        }
        return { actualValue, unit }
    }

    private susbscribeToEvent() {
        if (this.websocket) {
            const event = {
                jsonrpc: '2.0',
                method: 'subscribe',
                id: 'txs',
                params: {
                    query: "tm.event='Tx'"
                }
            }
            this.websocket.send(JSON.stringify(event))
        }
    }

    private addMessageToChannel(payload: QueuePayload) {
        if (this.rabbitMqChannel) {
            let buffered = this.rabbitMqChannel.publish(
                appConfig.exchangeName,
                appConfig.cosmosHubRoutingKey,
                Buffer.from(JSON.stringify(payload)),
                {
                    persistent: true, // Message survives broker restart
                    contentType: 'application/json'
                }
            )
            console.log(`buffered to channel: ${buffered}`)
        } else {
            console.log("no channel found")
        }
    }

    async stop(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.websocket?.on('close', () => {
                console.log("Closed")
                resolve()
            })
        })
    }
}

// base 64 encode and decode
function isBase64(str: string): boolean {
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    return base64Regex.test(str) && (str.length % 4) === 0;
}

function decodeBase64(string: string) {
    return isBase64(string) ? Buffer.from(string, 'base64').toString('utf-8') : string
}