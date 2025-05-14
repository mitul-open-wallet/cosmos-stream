import amqp from 'amqplib';
import { appConfig, payloadProcessingQueueName, rabbitmqRoutingKey } from "../config";
import { Blockchain, CosmosResponse, PayloadParser, QueuePayload, queuePayloadDummy } from '../models/model';
import { error } from 'console';
import { Base64PayloadGenerator, GenericPayloadGenerator } from './PayloadGenerator';

export class RabbitMQController {
    private rabbitMqChannel: amqp.Channel | undefined = undefined
    private rabbitMqConnection: amqp.Connection | undefined = undefined
    private routingKey: string
    private websocketDataProcessingQueue: string

    constructor(private rabbitMqUrl: string = appConfig.rabbitMqUrl) {
        this.routingKey = rabbitmqRoutingKey(appConfig.blockchain)
        this.websocketDataProcessingQueue = payloadProcessingQueueName(appConfig.blockchain)
    }

    async setupRabbitMq(): Promise<void> {
        try {   
            
            this.rabbitMqConnection = await amqp.connect(this.rabbitMqUrl)
            this.rabbitMqChannel = await this.rabbitMqConnection.createChannel()
            this.rabbitMqChannel.assertExchange(appConfig.exchangeName, 'direct')
            this.rabbitMqChannel.assertQueue(this.websocketDataProcessingQueue, {durable: true})
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
        } else {
            console.log("no channel found")
        }
    }

    addWebsocketPayloadToQueue(payload: string) {
        const queued = this.rabbitMqChannel?.sendToQueue(
            this.websocketDataProcessingQueue,
            Buffer.from(payload),
            { persistent: true }
        )
        return queued
    }

    consumeDataFromPayloadQueue() {
        this.rabbitMqChannel?.consume(
            this.websocketDataProcessingQueue,
            async (message) => {
                if (message) {
                    let response: CosmosResponse = JSON.parse(message.content.toString())
                    console.log("consumed message from queue")
                    const payloadParser = this.payloadParser()
                    const payload = payloadParser.handleResponse(response)
                    if (payload !== undefined && payload !== queuePayloadDummy) {
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