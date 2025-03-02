import dotenv from "dotenv";
import { AppConfig } from "./config.interface";

dotenv.config();

export const appConfig: AppConfig = (() => {
    return {
        port: process.env.PORT ?? "3000",
        exchangeName: process.env.EXCHANGE_NAME ?? "",
        cosmosHubRoutingKey: process.env.COSMOS_HUB_ROUTING_KEY ?? "",
        rabbitMqUrl: process.env.RABBIT_MQ_URL ?? ""
    }
})()