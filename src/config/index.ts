import dotenv from "dotenv";
import { AppConfig } from "./config.interface";
import { Blockchain } from "../models/model";

dotenv.config();

export const appConfig: AppConfig = (() => {
    return {
        port: process.env.PORT ?? "3000",
        exchangeName: process.env.EXCHANGE_NAME ?? "",
        rabbitMqUrl: process.env.RABBIT_MQ_URL ?? "",
        blockchain: initBlockchain(process.env.BLOCKCHAIN_SLUG ?? "")
    }
})()

function initBlockchain(slug: string): Blockchain {
    let concernedBlockchain = Object.values(Blockchain).find(value => {
        return value === slug
    })
    if(concernedBlockchain === undefined) {
        throw new Error(`cant resolve the network name: ${slug}`)
    }
    return concernedBlockchain
} 

export function wssEndpoint(blockchain: Blockchain): string {
    if(blockchain === Blockchain.COSMOS_HUB) {
        return "wss://atom.nownodes.io/wss/7a9449f4-dc1e-40ca-be00-72935bf0fd49"
    } else if (blockchain === Blockchain.INJECTIVE) {
        return "wss://injective-rpc.publicnode.com:443/db0e01d9b3315761b60b379437249f97953755a46742618a28f2e12c57b3e506/websocket"
    } else if (blockchain === Blockchain.CELESTIA) {
        return "wss://celestia-rpc.publicnode.com:443/websocket"
    }
    return ""
}

export function rabbitmqRoutingKey(blockchain: Blockchain): string {
    if(blockchain === Blockchain.COSMOS_HUB) {
        return "cosmos_hub"
    } else if (blockchain === Blockchain.INJECTIVE) {
        return "injective"
    } else if (blockchain === Blockchain.CELESTIA) {
        return "celestia"
    }
    return ""
}