import { CosmosWalletMonitorController } from "./CosmosWalletMonitorController"
import { RabbitMQController } from "./RabbitMQController"
import { error } from "console"

export class CosmosHubDataOrchestrator {
    private cosmosWalletMonitorController: CosmosWalletMonitorController | undefined
    private rabbitMQController = new RabbitMQController()

    constructor() {}

    async bootstrap() {
        await this.start()
        setTimeout(() => {
            setInterval(async () => {
                console.log("checking if restart is required")
                try {
                    await this.cosmosWalletMonitorController?.restartIfRequired()
                    console.log("successfully restarted the service")
                } catch (error) {
                    console.error("did not get an opportunity to restart")
                }
            }, 60000 * 1)
        }, 450000 * 1)
    }

    private async start() {
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