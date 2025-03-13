import WebSocket from "ws";
import amqp from 'amqplib';
import { CosmosResponse } from "../models/model";
import { QueuePayload } from "../models/model";
import { appConfig } from "../config";
import { PayloadGenerator } from "./PayloadGenerator";

export class CosmosWalletMonitor {

    private websocket: WebSocket | undefined = undefined;
    private rabbitMqChannel: amqp.Channel | undefined = undefined
    private rabbitMqConnection: amqp.Connection | undefined = undefined
    private reconnectTimer: NodeJS.Timeout | undefined = undefined
    private payloadGenerator: PayloadGenerator | undefined

    private maxReconnectionDelay: number = 30000
    private initialReconnectionDelay = 1000
    private reconnectAttempts = 0
    private isShuttingDown = false
    private isConnecting = false

    constructor(
        private cosmosHubWebSocketEndpoint: string,
        private rabbitMqUrl: string = appConfig.rabbitMqUrl
    ) {
        this.cosmosHubWebSocketEndpoint = cosmosHubWebSocketEndpoint
    }

    async bootstrap(): Promise<void> {
        try {
            await this.start()
            await this.setupRabbitMq() 
        } catch (error) {
            console.error("websocket error", error)
            throw(error)
        }
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
                    this.reconnectAttempts = 0
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
                    this.payloadGenerator = new PayloadGenerator(response)
                    let payload = this.payloadGenerator.payload
                    if (payload) {
                        this.addMessageToChannel(payload)
                    }
                })
            } catch (error) {
                this.isConnecting = false
                console.error("Error establishing websocket connection", error)
                reject(error)
            }
        })
    }

    private scheduleReconnect() {
        console.log(`scheduleReconnect ${this.reconnectAttempts}`)
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer)
        }

        if (this.reconnectAttempts > 10) {
            console.error(`Tried ${this.reconnectAttempts} to connect web socket, but failed so giving up`)
            return
        }

        const delay = Math.min(
            this.initialReconnectionDelay * Math.pow(2, this.reconnectAttempts),
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
            this.rabbitMqChannel = await this.rabbitMqConnection.createChannel()
            this.rabbitMqChannel.assertExchange(appConfig.exchangeName, 'direct')
        } catch (error) {
            console.error("rabbitmq connection error", {
                errorName: error,
                errorMessage: error
            })
            throw error
        }
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
        } else {
            console.log("Initialise websocket before susbcribing to an event")
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

    async closeWebSocketConnection(timeout: number): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.websocket) {
                resolve()
                return
            }
            if (this.websocket.readyState === 3) {
                resolve()
                return
            }
            let timeoutID = setTimeout(async () => {
                reject(new Error("failed to close the web socket connection, so giving up"))
            }, timeout)
            this.websocket?.on('close', () => {
                clearTimeout(timeoutID)
                console.log("Closed")
                resolve()
            })
            this.websocket?.close()
        })
    }
}