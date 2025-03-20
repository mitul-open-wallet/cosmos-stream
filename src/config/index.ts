import dotenv from "dotenv";
import { AppConfig } from "./config.interface";
import { Blockchain } from "../models/model";

dotenv.config();

export const appConfig: AppConfig = (() => {
    return {
        port: process.env.PORT ?? "3000",
        exchangeName: process.env.EXCHANGE_NAME ?? "",
        cosmosHubRoutingKey: process.env.COSMOS_HUB_ROUTING_KEY ?? "",
        rabbitMqUrl: process.env.RABBIT_MQ_URL ?? "",
        wssEndpoint: process.env.WSS_ENDPOINT ?? "",
        blockchain: initBlockchain(process.env.BLOCKCHAIN_SLUG ?? "")
    }
})()

function initBlockchain(slug: string): Blockchain {
    console.log(`>> ${slug}`)
    let concernedBlockchain = Object.values(Blockchain).find(value => {
        return value === slug
    })
    if(concernedBlockchain === undefined) {
        throw new Error(`cant resolve the network name: ${slug}`)
    }
    return concernedBlockchain
}   