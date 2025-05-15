import { CosmosWalletMonitorController } from "./CosmosWalletMonitorController"
import { RabbitMQController } from "./RabbitMQController"
import { error } from "console"

export class CosmosHubDataOrchestrator {
    private cosmosWalletMonitorController: CosmosWalletMonitorController | undefined
    private rabbitMQController = new RabbitMQController()

    constructor() {}

    async bootstrap() {
        await this.start()
        let oneMinute = 60000
        // setTimeout(() => {
        //     setInterval(async () => {
        //         console.log("checking if restart is required")
        //         try {
        //             await this.cosmosWalletMonitorController?.restartIfRequired()
        //         } catch (error) {
        //             console.error("did not get an opportunity to restart")
        //         }
        //     }, oneMinute * 2)
        // }, oneMinute * 2)
    }

    private async start() {
        try {
            this.cosmosWalletMonitorController = new CosmosWalletMonitorController((response) => {
                try {
                    console.log(`${JSON.stringify(response)}`)
                    this.rabbitMQController.addMessageToChannel(response)
                } catch (error) {
                    console.error("caught an error while adding message to the exchange", error)
                }
            }, (rawPayload) => {
                const queued = this.rabbitMQController.addWebsocketPayloadToQueue(rawPayload)
                console.log(`queued successfully: ${queued}`)
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