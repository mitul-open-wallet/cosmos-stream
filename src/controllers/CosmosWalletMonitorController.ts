import WebSocket from "ws";
import amqp from 'amqplib';
import { CosmosHubDataResponse, CosmosResponse } from "../models/model";
import { QueuePayload } from "../models/model";
import { appConfig } from "../config";
import { PayloadGenerator } from "./PayloadGenerator";
import { error } from "console";

enum ConnectionStatus {
    NOT_INITIALISED,
    CONNECTING,
    CONNECTED,
    CLOSING,
    CLOSED,
    GIVEN_UP,
    SYSTEM_ERROR
}

export class CosmosWalletMonitorController {

    private websocket: WebSocket | undefined = undefined;
    private reconnectTimer: NodeJS.Timeout | undefined = undefined
    private payloadGenerator: PayloadGenerator | undefined
    private connectionStatus: ConnectionStatus = ConnectionStatus.NOT_INITIALISED
    private callback: CosmosHubDataResponse

    private maxReconnectionDelay: number = 30000
    private maxReconnectionAttempts = 10
    private initialReconnectionDelay = 1000
    private reconnectAttempts = 0

    constructor(
        private cosmosHubWebSocketEndpoint: string,
        callback: CosmosHubDataResponse
        ) {
        this.cosmosHubWebSocketEndpoint = cosmosHubWebSocketEndpoint
        this.callback = callback
    }

    async bootstrap(): Promise<void> {
        try {
            await this.start()
        } catch (error) {
            console.error("websocket error", error)
            throw(error)
        }
    }

    private async start(): Promise<void> {
        if (this.connectionStatus === ConnectionStatus.CONNECTING || this.connectionStatus === ConnectionStatus.CLOSING) {
            return Promise.resolve()
        }
        this.connectionStatus = ConnectionStatus.CONNECTING
        return new Promise((resolve, reject) => {
            try {
                this.websocket = new WebSocket(
                    this.cosmosHubWebSocketEndpoint
                )
                this.websocket.on('open', () => {
                    this.connectionStatus = ConnectionStatus.CONNECTED
                    this.reconnectAttempts = 0
                    console.log("Connected")
                    this.subscribeToEvent()
                    resolve()
                })
                this.websocket.on('close', (code, reason) => {
                    console.log("Closed")
                    this.connectionStatus = ConnectionStatus.CLOSED
                })
                this.websocket.on('error', (error: Error) => {
                    console.log(error)
                    // if it fails during start up, reject and report
                    if (this.reconnectAttempts === 0) {
                        this.connectionStatus = ConnectionStatus.CLOSED
                        reject(error)
                    } else {
                        this.connectionStatus = ConnectionStatus.CONNECTING
                        this.scheduleReconnect()
                    }
                })
                this.websocket.on('message', (data: WebSocket.Data) => {
                    let response: CosmosResponse = JSON.parse(data.toString())
                    this.payloadGenerator = new PayloadGenerator(response)
                    let payload = this.payloadGenerator.payload
                    this.callback(payload)
                })
            } catch (error) {
                this.connectionStatus = ConnectionStatus.SYSTEM_ERROR
                console.error("Error establishing websocket connection", error)
                reject(error)
            }
        })
    }

    private scheduleReconnect() {
        console.log(`scheduleReconnect ${this.reconnectAttempts}`)
        if (this.reconnectAttempts > this.maxReconnectionAttempts) {
            this.connectionStatus = ConnectionStatus.GIVEN_UP
            console.error(`Tried ${this.reconnectAttempts} to connect web socket, but failed so giving up`)
            return
        }
        
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer)
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

    private subscribeToEvent() {
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
            throw new Error("the websocket does not exist")
        }
    }

    async closeWebSocketConnection(timeout: number): Promise<void> {
        this.connectionStatus = ConnectionStatus.CLOSING
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
                this.connectionStatus = ConnectionStatus.CLOSED
                resolve()
            })
            this.websocket?.close()
        })
    }

    async shutdown(): Promise<void> {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer)
        }
        try {
            await this.closeWebSocketConnection(25000)
        } catch {
            throw error
        }
    }
}