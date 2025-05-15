import WebSocket, { CLOSED } from "ws";
import { Blockchain, CosmosHubDataResponse, CosmosHubPayloadResponse, CosmosResponse, PayloadParser, queuePayloadDummy } from "../models/model";
import { error } from "console";
import { GenericPayloadGenerator, Base64PayloadGenerator } from "./PayloadGenerator";
import { appConfig, wssEndpoint } from "../config";
import { ConnectionStatus } from "../models/model";
import { Resend } from "resend";

class RestartTimeStamp {
    private previous: Date | undefined
    private latest: Date | undefined

    setDate(date: Date) {
        this.previous = this.latest
        this.latest = date
    }

    prettyPrint() {
        const delta = (this.latest?.getTime() ?? 0) - (this.previous?.getTime() ?? 0)
        console.log(`time difference between restart ${delta}\nlatest: ${this.latest} previous: ${this.previous}`)
    }
}

export class CosmosWalletMonitorController {

    private websocket: WebSocket | undefined = undefined;
    private reconnectTimer: NodeJS.Timeout | undefined = undefined
    private payloadGenerator: PayloadParser | undefined
    private connectionStatus: ConnectionStatus = ConnectionStatus.NOT_INITIALISED
    private cosmosHubWebSocketEndpoint: string
    private callback: CosmosHubDataResponse
    private rawPayload: CosmosHubPayloadResponse
    private lastKnownMessageTimestamp: Date | undefined
    private resendClient: Resend | undefined
    private restartTimestamp = new RestartTimeStamp()

    private reconnectAttempts = 0
    private shutdownInProgress = false

    constructor(callback: CosmosHubDataResponse, rawPayload: CosmosHubPayloadResponse) {
        this.cosmosHubWebSocketEndpoint = wssEndpoint(appConfig.blockchain)
        this.resendClient = new Resend(appConfig.resendAPIKey)
        console.log(this.cosmosHubWebSocketEndpoint)
        this.callback = callback
        this.rawPayload = rawPayload
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
        try {
            await this.shutdown()
            console.log("sucessfully shut down")
        } catch (error) {
            await this.sendNotificationDuringError("shutdown", error)
            throw error
        }
        
        try {
            await this.start()
            this.restartTimestamp.setDate(new Date())
            console.log("sucessfully restarted")
        } catch (error) {
            await this.sendNotificationDuringError("restart", error)
            throw error
        }
    }

    private async sendNotificationDuringError(subject: string, error: unknown) {
        if (error instanceof Error) {
            await this.sendEmailNotification(`error during forced ${subject}`, `${error.message}`)
        } else {
            await this.sendEmailNotification(`error during forced ${subject}`, "")
        }
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
        return new Promise(async (resolve, reject) => {
            try {
                this.websocket = new WebSocket(
                    this.cosmosHubWebSocketEndpoint
                )
                this.websocket.binaryType = 'arraybuffer'
                let pingInterval: NodeJS.Timeout | undefined
                let messageDropInterval: NodeJS.Timeout | undefined
                this.websocket.on('open', () => {
                    this.connectionStatus = ConnectionStatus.CONNECTED
                    this.reconnectAttempts = 0
                    console.log("Connected")
                    this.subscribeToEvent()
                    // pingInterval = setInterval(async () => {
                    //     if (this.websocket?.readyState === WebSocket.OPEN) {
                    //         this.websocket.ping();
                    //         console.log("sending ping to keep connection alive")
                    //         console.log(`Last known restart time: ${this.restartTimestamp.prettyPrint()}`)
                    //     }
                    // }, 7000)
                    // messageDropInterval = setInterval(async () => {
                    //     if (this.lastKnownMessageTimestamp) {
                    //         console.log("checking restart required due to inactivity")
                    //         let intervalinMs = (new Date()).getTime() - this.lastKnownMessageTimestamp.getTime()
                    //         let toMinutes = (intervalinMs / 1000) / 60
                    //         console.log(`time elapsed in mins: ${toMinutes} and interval: ${intervalinMs}`)
                    //         if (toMinutes > 3 && appConfig.blockchain === Blockchain.INJECTIVE) {
                    //             await this.sendEmailNotification("restarting service", `${appConfig.blockchain} service will be restarted due to inactivity`)
                    //             console.log(`more than ${toMinutes} mins elapsed, restarting the service`)
                    //             await this.forceRestartDueToMessageDrop()
                    //         }
                    //     }
                    // }, 60 * 1000 * 5) // check every 5 minutes
                    resolve()
                })
                this.websocket.on('close', async (code, reason) => {
                    console.log(`>>>> WSS closed ${code} ${reason}`)
                    this.connectionStatus = ConnectionStatus.CLOSED
                    if (pingInterval) {
                        clearInterval(pingInterval)
                        pingInterval = undefined
                    }
                    if (messageDropInterval) {
                        clearInterval(messageDropInterval)
                        messageDropInterval = undefined
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

                this.errorHandler(() => {
                    resolve()
                }, (error) => {
                    reject(error)
                })
                this.messageHandler()
            } catch (error) {
                this.connectionStatus = ConnectionStatus.SYSTEM_ERROR
                console.error("Error establishing websocket connection", error)
                await this.sendEmailNotification("Error establishing websocket connection", `${appConfig.blockchain} issue in connecting to the websocket`)
                reject(error)
            }
        })
    }

    private errorHandler(resolve: () => void, reject: (arg0: Error) => void) {
        this.websocket?.on('error', async (error: Error) => {
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
                            reject(error as Error)
                        }
                    }, 15000)
                }
            }
        })
    }

    private messageHandler() {
        this.websocket?.on('message', (data: WebSocket.Data) => {
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

                // put the data in a queue
                // and process it one by one
                this.rawPayload(responseString)

                // read the data from the consumer 
                // let response: CosmosResponse = JSON.parse(responseString)
                // this.payloadGenerator = this.payloadParser()
                // let payload = this.payloadGenerator.handleResponse(response)
                // if (payload !== undefined && payload !== queuePayloadDummy) {
                //     this.lastKnownMessageTimestamp = new Date()
                //     this.callback(payload)
                // } else {
                //     if (this.websocket?.readyState === WebSocket.OPEN) {
                //         try {
                //             const errorMessage = { type: 'ERROR', message: "error.message" }
                //             this.websocket.send(JSON.stringify(errorMessage))
                //         } catch (e) {
                //             console.error("Failed to send error response", e)
                //         }
                //     }
                // }
            } catch (error) {
                if (error instanceof SyntaxError) {
                    console.error(`Wrong syntax`, error)
                } else {
                    console.log("Unexpected error during parsing data")
                }
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
          ['open', 'close', 'error', 'message'].forEach(item => this.websocket?.removeAllListeners(item))
          if (this.websocket.readyState === WebSocket.OPEN || this.websocket.readyState === WebSocket.CONNECTING) {
            this.websocket.close();
          }
          this.websocket = undefined
        }
      }

    private async observeWebSocketClosingProcess(timeout: number): Promise<void> {
        this.connectionStatus = ConnectionStatus.CLOSING
        return new Promise((resolve, reject) => {
            if (!this.websocket) {
                resolve()
                return
            }
            if (this.websocket.readyState === CLOSED) {
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
            await this.observeWebSocketClosingProcess(10000)
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

    private async sendEmailNotification(
        subject: string = 'Notification Cosmos Streams',
        content: string = '<strong>Message from Cosmos streams</strong>'
    ) {
        if (this.resendClient) {
            try {
                await this.resendClient?.emails.send({
                    from: 'Open Wallet <notifications@email-notification.openwallet.finance>',
                    to: ['mitul.manish@gmail.com'],
                    subject: subject,
                    html: `<strong>${content}</strong>`
                })
                console.log("Successfully sent email")
            } catch (error) {
                console.error(`error sending email`, error)
                throw error
            }
        } else {
            console.log("issue in initialising Resend client")
        }
    }
}


/*
import amqp from 'amqplib';

interface CosmosResponse {
  // Define your response structure here
  id?: string;
  result?: any;
  // other fields...
}

private async messageHandler() {
  // RabbitMQ connection
  const connection = await amqp.connect('amqp://localhost'); // Change to your RabbitMQ server
  const channel = await connection.createChannel();
  
  // Define your queue
  const queueName = 'injective_transactions';
  await channel.assertQueue(queueName, { durable: true });
  
  this.websocket?.on('message', async (data: WebSocket.Data) => {
    try {
      let responseString: string = "";
      
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

      // Parse the message
      const response: CosmosResponse = JSON.parse(responseString);
      
      // Send to RabbitMQ queue
      await channel.sendToQueue(
        queueName, 
        Buffer.from(JSON.stringify(response)),
        { persistent: true }
      );
      
      console.log(`[x] Sent message to queue: ${response.id || 'unknown'}`);
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });
  
  // Setup a consumer in the same service or another service
  this.setupConsumer(channel, queueName);
}

private async setupConsumer(channel: amqp.Channel, queueName: string) {
  // Process messages from the queue
  await channel.consume(queueName, async (msg) => {
    if (msg) {
      try {
        const response: CosmosResponse = JSON.parse(msg.content.toString());
        
        // Process the payload
        await this.processPayload(response);
        
        // Acknowledge the message was processed
        channel.ack(msg);
      } catch (error) {
        console.error('Error consuming message:', error);
        // Nack and requeue for retry or handle error differently
        channel.nack(msg, false, true);
      }
    }
  });
}

private async processPayload(response: CosmosResponse) {
  // Implement your payload processing logic here
  // This could involve updating a database, triggering other services, etc.
  console.log(`Processing payload: ${response.id}`);
  
  // Your existing payload parsing logic
  // this.payloadGenerator = this.payloadParser()
  
  // Process transaction data
  // ...
}
*/