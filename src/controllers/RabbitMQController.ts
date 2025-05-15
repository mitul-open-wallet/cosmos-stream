import amqp, { Options } from 'amqplib';
import { appConfig, payloadProcessingQueueName, rabbitmqRoutingKey } from "../config";
import { Blockchain, CosmosResponse, PayloadParser, QueuePayload, queuePayloadDummy } from '../models/model';
import { error } from 'console';
import { Base64PayloadGenerator, GenericPayloadGenerator } from './PayloadGenerator';
  
export class RabbitMQController {
    private rabbitMqChannel: amqp.Channel | undefined = undefined
    private rabbitMqConnection: amqp.ChannelModel | undefined = undefined

    //consumer
    private rabbitMqConsumerChannel: amqp.Channel | undefined = undefined
    private rabbitMqConsumerConnection: amqp.ChannelModel | undefined = undefined

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
            this.rabbitMqConsumerConnection = await amqp.connect(appConfig.rabbitMQConsumerUrl, {
                frameMax: 131072,
                heartbeat: 60
            })
            this.rabbitMqConsumerChannel = await this.rabbitMqConsumerConnection.createChannel()
            await this.rabbitMqConsumerChannel.assertExchange(appConfig.exchangeName, 'direct')

            await this.rabbitMqChannel.assertQueue(this.websocketDataProcessingQueue, {durable: false})
            this.consumeDataFromPayloadQueue()
        } catch (error) {
            console.error("rabbitmq connection error", {
                errorName: error, 
                errorMessage: error
            })
            throw error
        }
    }

    addMessageToChannel(payload: QueuePayload) {
        if (this.rabbitMqConsumerChannel) {
            let buffered = this.rabbitMqConsumerChannel.publish(
                appConfig.exchangeName,
                this.routingKey,
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

    addWebsocketPayloadToQueue(payload: string) {
        try {
            const queued = this.rabbitMqChannel?.sendToQueue(
                this.websocketDataProcessingQueue,
                Buffer.from(payload),
                { persistent: false }
            )
            return queued
        } catch (error) {
            console.error("falied while adding message to the queue", error)
            return false
        }
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