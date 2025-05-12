import dotenv from "dotenv";
import { AppConfig } from "./config.interface";
import { Blockchain } from "../models/model";

dotenv.config();

export const appConfig: AppConfig = (() => {
    return {
        port: process.env.PORT ?? "3000",
        exchangeName: process.env.EXCHANGE_NAME ?? "",
        rabbitMqUrl: process.env.RABBIT_MQ_URL ?? "",
        blockchain: initBlockchain(process.env.BLOCKCHAIN_SLUG ?? ""),
        resendAPIKey: process.env.RESEND_API_KEY ?? ""
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
            return "wss://akt.nownodes.io/wss/7a9449f4-dc1e-40ca-be00-72935bf0fd49"
        case Blockchain.AXELAR:
             return "wss://axelar.nownodes.io/wss/7a9449f4-dc1e-40ca-be00-72935bf0fd49"
        case Blockchain.CELESTIA:
            return "wss://tia.nownodes.io/wss/7a9449f4-dc1e-40ca-be00-72935bf0fd49"
        case Blockchain.COSMOS_HUB:
             return "wss://atom.nownodes.io/wss/7a9449f4-dc1e-40ca-be00-72935bf0fd49"
        case Blockchain.INJECTIVE:
            return "wss://sentry.tm.injective.network:443/websocket"//"wss://inj.nownodes.io/wss/7a9449f4-dc1e-40ca-be00-72935bf0fd49"
        case Blockchain.osmosis:
            return "wss://osmo.nownodes.io/wss/7a9449f4-dc1e-40ca-be00-72935bf0fd49"
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
        case Blockchain.INJECTIVE:
            return "injective"
        case Blockchain.osmosis:
            return "osmosis"
        default:
            return ""
    }
}