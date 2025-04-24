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
    SYSTEM_ERROR,
    NEEDS_RESTART
}

export class CosmosWalletMonitorController {

    private websocket: WebSocket | undefined = undefined;
    private reconnectTimer: NodeJS.Timeout | undefined = undefined
    private payloadGenerator: PayloadParser | undefined
    private connectionStatus: ConnectionStatus = ConnectionStatus.NOT_INITIALISED
    private cosmosHubWebSocketEndpoint: string
    private callback: CosmosHubDataResponse
    private lastKnownMessageTimestamp: Date | undefined

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
        function logEarlyTermination() {
            console.log(`early termination during restart`)
        }
        switch (this.connectionStatus) {
            case ConnectionStatus.NOT_INITIALISED:
                logEarlyTermination()
                return Promise.resolve()
            case ConnectionStatus.CLOSING:
                logEarlyTermination()
                return Promise.resolve()
            case ConnectionStatus.CONNECTED:
                logEarlyTermination()
                return Promise.resolve()
            case ConnectionStatus.CONNECTING:
                console.log("connection in progress, restart not required")
                console.log(`found connect status - wss state: ${this.websocket?.readyState} connection status: ${this.connectionStatus}`)
                return Promise.resolve()
            default:
                console.log(`found connect status - wss state: ${this.websocket?.readyState} connection status: ${this.connectionStatus}`)
                await this.shutdown()
                console.log("sucessfully shut down")
                await this.start()
                console.log("sucessfully restarted")
        }
    }

    async forceRestartDueToMessageDrop() {
        console.log(`found connect status - wss state: ${this.websocket?.readyState} connection status: ${this.connectionStatus}`)
        await this.shutdown()
        console.log("sucessfully shut down")
        await this.start()
        console.log("sucessfully restarted")
    }

    async handleTerminationSignal(operation: string) {
        console.log(`received sigterm: ${operation}`)
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
            throw error
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
            console.log("connection closing - so early termination")
            return Promise.resolve()
        }
        this.cleanupWebSocket()
        this.connectionStatus = ConnectionStatus.CONNECTING
        return new Promise((resolve, reject) => {
            try {
                this.websocket = new WebSocket(
                    this.cosmosHubWebSocketEndpoint
                )
                this.websocket.binaryType = 'arraybuffer'
                let pingInterval: NodeJS.Timeout | null
                let messageDropInterval: NodeJS.Timeout | undefined
                this.websocket.on('open', () => {
                    this.connectionStatus = ConnectionStatus.CONNECTED
                    this.reconnectAttempts = 0
                    console.log("Connected")
                    this.subscribeToEvent()
                    pingInterval = setInterval(() => {
                        if (this.websocket?.readyState === WebSocket.OPEN) {
                            this.websocket.ping();
                            console.log("sending ping to keep connection alive")
                            if (this.lastKnownMessageTimestamp) {
                                console.log(`Last known message at: ${this.lastKnownMessageTimestamp}`)
                            }
                        }
                    }, 7000)
                    messageDropInterval = setInterval(async () => {
                        if (this.lastKnownMessageTimestamp) {
                            console.log("checking restart required due to inactivity")
                            let intervalinMs = (new Date()).getTime() - this.lastKnownMessageTimestamp.getTime()
                            let toMinutes = Math.floor((intervalinMs / 1000) / 60)
                            console.log(`time elapsed in mins: ${toMinutes}`)
                            if (toMinutes > 1) {
                                console.log("more than ${toMinutes} mins elapsed, restarting the service")
                                await this.forceRestartDueToMessageDrop()
                            }
                        }
                    }, 60 * 1000 * 1) // check every minute
                    resolve()
                })
                this.websocket.on('close', async (code, reason) => {
                    console.log(`>>>> WSS closed ${code} ${reason}`)
                    this.connectionStatus = ConnectionStatus.CLOSED
                    if (pingInterval) {
                        clearInterval(pingInterval)
                        pingInterval = null
                    }

                    console.log("timeout, hence reconnecting")
                    if (code === 1013 || code === 1006) {
                        this.connectionStatus = ConnectionStatus.NEEDS_RESTART
                        try {
                            await this.restartIfRequired()
                        } catch (error) {
                            console.log(`error during restart`, error)
                            setTimeout(async () => {
                                try {
                                    await this.restartIfRequired()
                                } catch (error) {
                                    console.log(`error during restart thrown from catch block, needs to be investigated`, error)
                                }
                            }, 15000)
                        }
                    }
                })
                this.websocket.on('error', async (error: Error) => {
                    console.log(`WSS error ${error}`)
                    console.log(error)
                    // if it fails during start up, reject and report
                    if (this.reconnectAttempts === 0) {
                        this.connectionStatus = ConnectionStatus.CLOSED
                        reject(error)
                    } else {
                        this.connectionStatus = ConnectionStatus.NEEDS_RESTART
                        try {
                            await this.restartIfRequired()
                            resolve()
                        } catch (error) {
                            console.log(`error during restart`, error)
                            setTimeout(async () => {
                                try {
                                    await this.restartIfRequired()
                                    resolve()
                                } catch (error) {
                                    console.log(`error during restart thrown from catch block, needs to be investigated`, error)
                                    reject(error)
                                }
                            }, 15000)
                        }
                    }
                })
                this.websocket.on('message', (data: WebSocket.Data) => {
                    try {
                        let responseString: string = ""
                        // Handle different data types appropriately
                        if (data instanceof ArrayBuffer) {
                            // Convert ArrayBuffer to string using TextDecoder
                            responseString = new TextDecoder('utf-8').decode(data);
                        } else if (Buffer.isBuffer(data)) {
                            // Handle Node.js Buffer
                            responseString = data.toString('utf-8');
                        } else {
                            // Already a string
                            responseString = data.toString();
                        }
                        let response: CosmosResponse = JSON.parse(responseString)
                        this.payloadGenerator = this.payloadParser()
                        let payload = this.payloadGenerator.handleResponse(response)
                        if (payload !== undefined && payload !== queuePayloadDummy) {
                            this.lastKnownMessageTimestamp = new Date()
                            this.callback(payload)
                        } else {
                            if (this.websocket?.readyState === WebSocket.OPEN) {
                                try {
                                    const errorMessage = { type: 'ERROR', message: "error.message" }
                                    this.websocket.send(JSON.stringify(errorMessage))
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

    private cleanupWebSocket(): void {
        if (this.websocket) {
          // Remove all listeners
          this.websocket.removeAllListeners('open');
          this.websocket.removeAllListeners('close');
          this.websocket.removeAllListeners('error');
          this.websocket.removeAllListeners('message');
          this.websocket.close();
        }
      }

    private async observeWebSocketClosingProcess(timeout: number): Promise<void> {
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
                console.log("Closed and clearing the websocket")
                this.connectionStatus = ConnectionStatus.CLOSED
                resolve()
            })
        })
    }

    async shutdown(): Promise<void> {
        this.shutdownInProgress = true
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer)
        }
        this.cleanupWebSocket()
        try {
            await this.observeWebSocketClosingProcess(25000)
            this.connectionStatus = ConnectionStatus.CLOSED
            this.websocket = undefined
        } catch {
            this.connectionStatus = ConnectionStatus.CLOSED
            this.websocket = undefined
            throw error
        }   
    }

    payloadParser(): PayloadParser {
        switch (appConfig.blockchain) {
            case Blockchain.AXELAR:
                return new Base64PayloadGenerator()
            case Blockchain.CELESTIA:
                return new Base64PayloadGenerator()
            case Blockchain.COSMOS_HUB:
                return new GenericPayloadGenerator()
            case Blockchain.INJECTIVE:
                return new GenericPayloadGenerator()
            case Blockchain.AKASH:
                return new Base64PayloadGenerator()
            case Blockchain.osmosis:
                return new GenericPayloadGenerator()
            default:
                return new GenericPayloadGenerator()
        }
    }
}


