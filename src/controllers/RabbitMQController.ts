import amqp from 'amqplib';
import { appConfig } from "../config";
import { QueuePayload } from '../models/model';
import { error } from 'console';

export class RabbitMQController {
    private rabbitMqChannel: amqp.Channel | undefined = undefined
    private rabbitMqConnection: amqp.Connection | undefined = undefined

    constructor(private rabbitMqUrl: string = appConfig.rabbitMqUrl) {}

    async setupRabbitMq(): Promise<void> {
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

    addMessageToChannel(payload: QueuePayload) {
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
            throw new Error("no Rabbit MQ channel found")
        }
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
}