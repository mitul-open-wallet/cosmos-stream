import amqp, { Options } from 'amqplib';
import { appConfig, blockchainQueueName, payloadProcessingQueueName, rabbitmqRoutingKey } from "../config";
import { Blockchain, CosmosResponse, PayloadParser, QueuePayload, queuePayloadDummy } from '../models/model';
import { error } from 'console';
import { Base64PayloadGenerator, GenericPayloadGenerator } from './PayloadGenerator';
  
export class RabbitMQController {
    private rabbitMqChannel: amqp.Channel | undefined = undefined
    private rabbitMqConnection: amqp.ChannelModel | undefined = undefined

    //consumer
    private rabbitMqConsumerChannel: amqp.Channel | undefined = undefined
    private rabbitMqConsumerConnection: amqp.ChannelModel | undefined = undefined
    private consumerQueue = "cosmos-transaction-processor"

    private routingKey: string
    private websocketDataProcessingQueue: string

    constructor(private rabbitMqUrl: string = appConfig.rabbitMqUrl) {
        this.routingKey = rabbitmqRoutingKey(appConfig.blockchain)
        this.websocketDataProcessingQueue = payloadProcessingQueueName(appConfig.blockchain)
    }

    async setupRabbitMq(): Promise<void> {
        try {   
            this.rabbitMqConnection = await amqp.connect(this.rabbitMqUrl, {
                frameMax: 131072,
                heartbeat: 60
            })
            this.rabbitMqChannel = await this.rabbitMqConnection.createChannel()

            // consumer
            // this.rabbitMqConsumerConnection = await amqp.connect(appConfig.rabbitMQConsumerUrl, {
            //     frameMax: 131072,
            //     heartbeat: 60
            // })
            // this.rabbitMqConsumerChannel = await this.rabbitMqConsumerConnection.createChannel()
            await this.rabbitMqChannel.assertExchange(appConfig.exchangeName, 'direct')
            let chainSpecificQueueName = blockchainQueueName(appConfig.blockchain)
            let chainSpeficRoutingKey = rabbitmqRoutingKey(appConfig.blockchain)
            const queue = await this.rabbitMqChannel.assertQueue(chainSpecificQueueName, {
                durable: true
            })
            await this.rabbitMqChannel.bindQueue(
                queue.queue,
                appConfig.exchangeName,
                chainSpeficRoutingKey
            )


            // await this.rabbitMqChannel.assertQueue(this.websocketDataProcessingQueue, {durable: true})
            // this.consumeDataFromPayloadQueue()
            this.consumeMessageFromQueue(queue.queue, appConfig.blockchain)
        } catch (error) {
            console.error("rabbitmq connection error", {
                errorName: error, 
                errorMessage: error
            })
            throw error
        }
    }

    private consumeMessageFromQueue(queue: string, blockchain: Blockchain) {
        if (this.rabbitMqChannel) {
            this.rabbitMqChannel.consume(queue, (message) => {
                console.log(`>> received on ${blockchain} ${message!.content.toString()}`)
                if (message) {
                    // let response: QueuePayload = JSON.parse(message.content.toString())
                    // const blockchainResponse = toBlockchainReponse(blockchain, response)
                    // console.log(JSON.stringify(blockchainResponse))
                    // // Send the message
                    // const success = this.rabbitMqConsumerChannel?.sendToQueue(
                    //     this.consumerQueue,
                    //      Buffer.from(JSON.stringify(blockchainResponse)
                    //     ), {
                    //     persistent: true
                    // });
                    console.log(`message sent to consumer: ${true}`)
                    this.rabbitMqChannel?.ack(message)
                } else {
                    console.log("no message")
                }
            },
            {
                noAck: false
            }
            )
        } else {
            console.log(`channel not found: ${this.rabbitMqUrl} ${appConfig.exchangeName}`)
        }
    }
    

    addMessageToChannel(payload: QueuePayload) {
        if (this.rabbitMqChannel) {
            let buffered = this.rabbitMqChannel.publish(
                appConfig.exchangeName,
                this.routingKey,
                Buffer.from(JSON.stringify(payload)),
                {
                    persistent: true, // Message survives broker restart
                    contentType: 'application/json'
                }
            )
            console.log(`buffered to channel: ${buffered}`)
            return buffered
        } else {
            console.log("no channel found")
            return false
        }
    }

    async addWebsocketPayloadToQueue(payload: string) {
        // try {
        //     const queued = this.rabbitMqChannel?.sendToQueue(
        //         this.websocketDataProcessingQueue,
        //         Buffer.from(payload),
        //         { persistent: false }
        //     )
        //     return queued
        // } catch (error) {
        //     console.error("falied while adding message to the queue", error)
        //     return false
        // }
        
        let response: CosmosResponse = JSON.parse(payload)
        const payloadParser = this.payloadParser()
        const queuePayload = payloadParser.handleResponse(response)
        console.log(queuePayload)
        if (payload !== undefined && queuePayload !== queuePayloadDummy) {
            console.log("adding message to channel")
            let queued = this.addMessageToChannel(queuePayload)
            return queued
        }
        console.log("no payload")
        return false
    }

    consumeDataFromPayloadQueue() {
        this.rabbitMqChannel?.consume(
            this.websocketDataProcessingQueue,
            (message) => {
                if (message) {
                    let response: CosmosResponse = JSON.parse(message.content.toString())
                    this.rabbitMqChannel?.ack(message)
                    console.log("consumed message from queue")
                    const payloadParser = this.payloadParser()
                    const payload = payloadParser.handleResponse(response)
                    console.log(payload)
                    if (payload !== undefined && payload !== queuePayloadDummy) {
                        console.log("adding message to channel")
                        this.addMessageToChannel(payload)
                    }
                }
            }
        )
    }

    async shutdown(): Promise<void> {
        try {
            if (this.rabbitMqChannel) {
                await this.rabbitMqChannel.close()
            }
            if (this.rabbitMqConnection) {
                await this.rabbitMqConnection.close()
            }
        } catch {
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