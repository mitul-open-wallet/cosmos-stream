import WebSocket from "ws";
import { Blockchain, CosmosHubDataResponse, CosmosResponse, PayloadParser, queuePayloadDummy } from "../models/model";
import { error } from "console";
import { GenericPayloadGenerator, Base64PayloadGenerator } from "./PayloadGenerator";
import { appConfig, wssEndpoint } from "../config";

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
    private payloadGenerator: PayloadParser | undefined
    private connectionStatus: ConnectionStatus = ConnectionStatus.NOT_INITIALISED
    private cosmosHubWebSocketEndpoint: string
    private callback: CosmosHubDataResponse

    private maxReconnectionDelay: number = 30000
    private maxReconnectionAttempts = 10
    private initialReconnectionDelay = 1000
    private reconnectAttempts = 0
    private shutdownInProgress = false

    constructor(callback: CosmosHubDataResponse) {
        this.cosmosHubWebSocketEndpoint = wssEndpoint(appConfig.blockchain)
        console.log(this.cosmosHubWebSocketEndpoint)
        this.callback = callback
        this.setupSignalHandlers()
    }

    private setupSignalHandlers(): void {
        // Handle graceful shutdown on SIGTERM and SIGINT
        process.on('SIGTERM', this.handleTerminationSignal.bind(this, 'SIGTERM'));
        process.on('SIGINT', this.handleTerminationSignal.bind(this, 'SIGINT'));
    }

    async restartIfRequired() {
        switch (this.connectionStatus) {
            case ConnectionStatus.NOT_INITIALISED, ConnectionStatus.CLOSING, ConnectionStatus.CONNECTING, ConnectionStatus.CONNECTED:
                return Promise.resolve()
            default:
                return new Promise<void>(async (resolve, reject)=> {
                    switch (this.websocket?.readyState) {
                        case WebSocket.CLOSED:
                            console.log("connection closed")
                            await this.shutdown()
                            console.log("successfully shut down")
                            await this.start()
                            console.log("successfully restarted service")
                            console.log(`wss state: ${this.websocket?.readyState} connection status: ${this.connectionStatus}`)
                            resolve()
                        case WebSocket.CLOSING:
                            reject(new Error("connection is closing, no need to restart"))
                        case WebSocket.CONNECTING:
                            reject(new Error("connection is progress, no need to restart"))
                        case WebSocket.OPEN:
                            reject(new Error("connection is already established, no need to restart"))
                    }
                })
        }
    }

    async handleTerminationSignal(operation: string) {
        if (this.shutdownInProgress) {
            return;
        }
        this.shutdownInProgress = true
        try {
            console.log("gracefully shutting down")
            await this.shutdown()
            process.exit(0)
        } catch {
            console.log("websocket termination", error)
            process.exit(1)
        }
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
        if (this.connectionStatus === ConnectionStatus.CLOSING) {
            return Promise.resolve()
        }
        this.connectionStatus = ConnectionStatus.CONNECTING
        return new Promise((resolve, reject) => {
            try {
                this.websocket = new WebSocket(
                    this.cosmosHubWebSocketEndpoint
                )
                let pingInterval: NodeJS.Timeout | null
                this.websocket.on('open', () => {
                    this.connectionStatus = ConnectionStatus.CONNECTED
                    this.reconnectAttempts = 0
                    console.log("Connected")
                    this.subscribeToEvent()

                    pingInterval = setInterval(() => {
                        if (this.websocket?.readyState === WebSocket.OPEN) {
                            this.websocket.ping();
                            console.log("sending ping to keep connection alive")
                        }
                    }, 7000)
                    resolve()
                })
                this.websocket.on('close', (code, reason) => {
                    console.log(`>>>> WSS closed ${code} ${reason}`)
                    this.connectionStatus = ConnectionStatus.CLOSED
                    if (pingInterval) {
                        clearInterval(pingInterval)
                        pingInterval = null
                    }

                    console.log("timeout, hence reconnecting")
                    if (code === 1013) {
                        this.connectionStatus = ConnectionStatus.CONNECTING
                        setTimeout(async () => {
                            this.scheduleReconnect()
                        }, 10000)
                    }
                })
                this.websocket.on('error', (error: Error) => {
                    console.log(`>>>> WSS error ${error}`)
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
                    try {
                        let response: CosmosResponse = JSON.parse(data.toString())
                        this.payloadGenerator = this.payloadParser()
                        let payload = this.payloadGenerator.handleResponse(response)
                        if (payload !== undefined && payload !== queuePayloadDummy) {
                            this.callback(payload)
                        } else {
                            if (this.websocket?.readyState === WebSocket.OPEN) {
                                try {
                                    const errorMsg = { type: 'ERROR', message: "error.message" }
                                    this.websocket.send(JSON.stringify(errorMsg))
                                } catch (e) {
                                    console.error("Failed to send error response", e)
                                }
                            }
                        }
                    } catch (error) {
                        if (error instanceof SyntaxError) {
                            console.error(`Wrong syntax`, error)
                        } else {
                            console.log("Unexpected error during parsing data")
                        }
                    }
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
                console.log(`calling start, while reconnecting, connection status: ${this.connectionStatus}`)
                await this.start()
            } catch (error) {
                console.log("failed during restart, reconnecting")
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

    private async closeWebSocketConnection(timeout: number): Promise<void> {
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
                this.shutdownInProgress = false
                clearTimeout(timeoutID)
                console.log("Closed")
                this.connectionStatus = ConnectionStatus.CLOSED
                resolve()
            })
            this.websocket?.close()
        })
    }

    async shutdown(): Promise<void> {
        this.shutdownInProgress = true
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer)
        }
        try {
            await this.closeWebSocketConnection(25000)
        } catch {
            throw error
        }
    }

    payloadParser(): PayloadParser {
        switch (appConfig.blockchain) {
            case Blockchain.AXELAR:
                return new GenericPayloadGenerator()
            case Blockchain.CELESTIA:
                return new Base64PayloadGenerator()
            case Blockchain.COSMOS_HUB:
                return new GenericPayloadGenerator()
            case Blockchain.EVMOS:
                return new GenericPayloadGenerator()
            case Blockchain.INJECTIVE:
                return new GenericPayloadGenerator()
            case Blockchain.AKASH:
                return new Base64PayloadGenerator()
            case Blockchain.dydx:
                return new GenericPayloadGenerator()
            case Blockchain.osmosis:
                return new GenericPayloadGenerator()
            default:
                return new GenericPayloadGenerator()
        }
    }
}


