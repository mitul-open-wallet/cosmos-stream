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
                console.log(`received: ${response}`)
                if (response !== undefined) {
                    this.rabbitMQController.addMessageToChannel(response)
                }
            })
            await this.cosmosWalletMonitorController.bootstrap();
            await this.rabbitMQController.setupRabbitMq();
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