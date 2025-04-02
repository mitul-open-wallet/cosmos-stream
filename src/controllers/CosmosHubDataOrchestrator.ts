import { CosmosWalletMonitorController } from "./CosmosWalletMonitorController"
import { RabbitMQController } from "./RabbitMQController"
import { error } from "console"

export class CosmosHubDataOrchestrator {
    private cosmosWalletMonitorController: CosmosWalletMonitorController | undefined
    private rabbitMQController = new RabbitMQController()

    constructor() {}

    async start() {
        try {
            this.cosmosWalletMonitorController = new CosmosWalletMonitorController((response) => {
                try {
                    this.rabbitMQController.addMessageToChannel(response)
                } catch (error) {
                    console.error("caught an error while adding message to the exchange", error)
                }
            })
            await this.rabbitMQController.setupRabbitMq();
            await this.cosmosWalletMonitorController.bootstrap();
        } catch {
            console.error("Failed to start the services", error)
            throw error
        }
    }

    async stop() {
        try {
            await Promise.all([this.rabbitMQController.shutdown(), this.cosmosWalletMonitorController?.shutdown()])
        } catch {
            console.error("Failed to stop the services", error)
            throw error
        }
    }
}