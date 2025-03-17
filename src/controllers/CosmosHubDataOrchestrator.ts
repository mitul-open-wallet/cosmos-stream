import { CosmosWalletMonitorController } from "./CosmosWalletMonitorController"
import { RabbitMQController } from "./RabbitMQController"
import { appConfig } from "../config"
import { error } from "console"

export class CosmosHubDataOrchestrator {
    private cosmosWalletMonitorController: CosmosWalletMonitorController | undefined
    private rabbitMQController = new RabbitMQController()

    constructor() {}

    async start() {
        try {
            this.cosmosWalletMonitorController = new CosmosWalletMonitorController(appConfig.wssEndpoint, (response) => {
                console.log(`received: ${response}`)
                if (response) {
                    this.rabbitMQController.addMessageToChannel(response)
                }
            })
            await this.rabbitMQController.setupRabbitMq();
            await this.cosmosWalletMonitorController.bootstrap();
        } catch {
            throw error
        }
    }

    async stop() {
        try {
            await this.rabbitMQController.shutdown()
            await this.cosmosWalletMonitorController?.shutdown()
        } catch {
            throw error
        }
    }
}