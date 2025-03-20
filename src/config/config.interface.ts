import { Blockchain } from "../models/model"

export interface AppConfig {
    port: string
    exchangeName: string
    cosmosHubRoutingKey: string
    rabbitMqUrl: string
    wssEndpoint: string
    blockchain: Blockchain
}