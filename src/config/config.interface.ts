import { Blockchain } from "../models/model"

export interface AppConfig {
    port: string
    exchangeName: string
    rabbitMqUrl: string
    blockchain: Blockchain
    resendAPIKey: string
    rabbitMQConsumerUrl: string
}