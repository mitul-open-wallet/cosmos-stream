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
    switch (blockchain) {
        case Blockchain.AKASH:
            return "wss://akash-rpc.publicnode.com:443/db0e01d9b3315761b60b379437249f97953755a46742618a28f2e12c57b3e506/websocket"
        case Blockchain.AXELAR:
             return "wss://axelar-rpc.publicnode.com:443/db0e01d9b3315761b60b379437249f97953755a46742618a28f2e12c57b3e506/websocket"
        case Blockchain.CELESTIA:
            return "wss://celestia-rpc.publicnode.com:443/db0e01d9b3315761b60b379437249f97953755a46742618a28f2e12c57b3e506/websocket"
        case Blockchain.COSMOS_HUB:
             return "wss://atom.nownodes.io/wss/7a9449f4-dc1e-40ca-be00-72935bf0fd49"
        case Blockchain.EVMOS:
            return "wss://evmos-rpc.publicnode.com:443/db0e01d9b3315761b60b379437249f97953755a46742618a28f2e12c57b3e506/websocket"
        case Blockchain.INJECTIVE:
            return "wss://injective-rpc.publicnode.com:443/db0e01d9b3315761b60b379437249f97953755a46742618a28f2e12c57b3e506/websocket"
        default:
            return ""
    }
}

export function rabbitmqRoutingKey(blockchain: Blockchain): string {
    switch (blockchain) {
        case Blockchain.AKASH:
            return "akash"
        case Blockchain.AXELAR:
            return "axelar"
        case Blockchain.CELESTIA:
            return "celestia"
        case Blockchain.COSMOS_HUB:
            return "cosmos_hub"
        case Blockchain.EVMOS:
            return "evmos"
        case Blockchain.INJECTIVE:
            return "injective"
        default:
            return ""
    }
}