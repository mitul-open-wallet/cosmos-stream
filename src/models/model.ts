export interface EventAttribute {
    key: string
    value: string
    index: boolean
}

interface TransactionEvent {
    type: string
    attributes: EventAttribute[]
}

interface TransactionResult {
    events: TransactionEvent[]
}

interface CosmosTransactionResult {
    height: string
    index: number
    tx?: string
    result: TransactionResult
}

interface TransactionValue {
    TxResult: CosmosTransactionResult
}

interface TransactionData {
    type: string
    value: TransactionValue
}

interface CosmosResult {
    query: string
    data?: TransactionData
    events: Events | undefined
}

export interface CosmosResponse {
    jsonrpc: string
    id: number
    result?: CosmosResult
}

interface Events {
    [key: string]: string[];
}

export interface TipReceiverItem {
    amount: CryptoAmount
    address: string
}

export interface CryptoAmount {
    amount: number
    unit: string
}

export interface TransferOperation {
    amount: CryptoAmount
    receiverAddress: string
    senderAddress: string
}

export const queuePayloadDummy = {
    date: new Date(),
    blockHeight: "",
    txHash: "",
    tipReceiver: [],
    feeAmount: 0,
    transaction: undefined
} as QueuePayload

export interface QueuePayload {
    date: Date
    blockHeight: string
    txHash: string | undefined
    tipReceiver: TipReceiverItem[]
    feeAmount: number
    transaction: TransferOperation | undefined
}

export type CosmosHubDataResponse = (payload: QueuePayload) => void
export type CosmosHubPayloadResponse = (payload: string) => void

export interface PayloadParser {
    handleResponse(response: CosmosResponse): QueuePayload
}

// TODO:- Add support for EVMOS

export enum Blockchain {
    COSMOS_HUB = "cosmos_hub",
    INJECTIVE = "injective",
    CELESTIA = "celestia",
    AXELAR = "axelar",
    AKASH = "akash",
    osmosis = "osmosis"
}

export function amountDenomination(blockchain: Blockchain): string {
    switch (blockchain) {
        case Blockchain.COSMOS_HUB: 
            return "uatom"
        case Blockchain.INJECTIVE: 
            return "inj"
        case Blockchain.CELESTIA: 
            return "utia"
        case Blockchain.AXELAR:
            return "uaxl"
        case Blockchain.AKASH:
            return "uakt"
        case Blockchain.osmosis:
            return "uosmo"
        default:
            return ""
    }
}

export enum ConnectionStatus {
    NOT_INITIALISED,
    CONNECTING,
    CONNECTED,
    CLOSING,
    CLOSED,
    GIVEN_UP,
    SYSTEM_ERROR,
    NEEDS_RESTART
}

export interface Network {
    name: string
    slug: string
    logoUri: string
}

export interface Asset {
    logoUri: string
    name: string
    decimals: number
    minimumPrecision: number,
    symbol: string,
    type: string
}

enum TransactionStatus {
    pending = "pending",
    confirmed = "confirmed"
}

export interface BlockchainReponse {
    blockchain: Blockchain
    date: Date
    network: Network
    asset: Asset
    blockHeight: string
    txHash: string | undefined
    fee: TransactionFee | undefined
    amount: number
    receiverAddress: string
    senderAddress: string
    status: TransactionStatus
}

export interface TransactionFee {
    asset: Asset,
    value: number
}

export function toBlockchainReponse(blockchain: Blockchain, payload: QueuePayload): BlockchainReponse | undefined {
    const detail = toSimplifiedTransaction(payload.transaction)
    let blockchainConstants = toBlockchainDetail(blockchain)
    if (blockchainConstants) {
        return {
            asset: blockchainConstants.asset,
            network: blockchainConstants.network,
            blockchain: blockchain,
            date: payload.date,
            blockHeight: payload.blockHeight,
            txHash: payload.txHash,
            fee: {
                asset: blockchainConstants.asset,
                value: payload.feeAmount ?? 0
            },
            amount: detail?.amount ?? 0,
            receiverAddress: detail?.receiverAddress ?? "",
            senderAddress: detail?.senderAddress ?? "",
            status: TransactionStatus.confirmed
        }
    }
    return undefined
}

interface BlockchainConstants {
    asset: Asset
    network: Network
}

function toBlockchainDetail(blockchain: Blockchain): BlockchainConstants | undefined {
    let detail: BlockchainDetail | undefined
    switch (blockchain) {
        case Blockchain.INJECTIVE:
            detail = {
                slug: "INJECTIVE",
                networkName: "Injective",
                symbol: "INJ",
                assetName: "injective",
                assetIcon: "https://storage.googleapis.com/openwalletassets/injective-icon.png",
                networkIcon: "https://storage.googleapis.com/openwalletassets/injective-icon.png",
                decimals: 18,
                minPrecision: 2
            }
            break
        case Blockchain.COSMOS_HUB:
            detail = {
                slug: "COSMOS",
                networkName: "Cosmos Hub",
                symbol: "ATOM",
                assetName: "atom",
                assetIcon: "https://storage.googleapis.com/openwalletassets/cosmos_thumb.png",
                networkIcon: "https://storage.googleapis.com/openwalletassets/cosmos-hub-icon.png",
                decimals: 6,
                minPrecision: 2
            }
            break
        case Blockchain.CELESTIA:
            detail = {
                slug: "CELESTIA",
                networkName: "Celestia",
                symbol: "TIA",
                assetName: "celestia",
                assetIcon: "https://storage.googleapis.com/openwalletassets/celestia-icon.png",
                networkIcon: "https://storage.googleapis.com/openwalletassets/celestia-icon.png",
                decimals: 6,
                minPrecision: 2
            }
            break
        case Blockchain.osmosis:
            detail = {
                slug: "OSMOSIS",
                networkName: "Osmosis",
                symbol: "OSMO",
                assetName: "Osmosis",
                assetIcon: "https://storage.googleapis.com/openwalletassets/osmosis-icon.jpg",
                networkIcon: "https://storage.googleapis.com/openwalletassets/osmosis-icon.jpg",
                decimals: 6,
                minPrecision: 2
            }
            break
        case Blockchain.AKASH:
            detail = {
                slug: "AKASH",
                networkName: "Akash",
                symbol: "AKT",
                assetName: "Akash",
                assetIcon: "https://storage.googleapis.com/openwalletassets/akash_icon.jpg",
                networkIcon: "https://storage.googleapis.com/openwalletassets/akash_icon.jpg",
                decimals: 6,
                minPrecision: 2
            }
            break
        case Blockchain.AXELAR:
            detail = {
                slug: "AXELAR",
                networkName: "Axelar",
                symbol: "AXL",
                assetName: "Axelar",
                assetIcon: "https://storage.googleapis.com/openwalletassets/axelar_icon.jpg",
                networkIcon: "https://storage.googleapis.com/openwalletassets/axelar_icon.jpg",
                decimals: 6,
                minPrecision: 2
            }
            break
        default:
            detail = undefined
    }
    if (detail !== undefined) {
        let asset: Asset = {
            logoUri: detail.assetIcon,
            name: detail.assetName,
            decimals: detail.decimals,
            minimumPrecision: detail.minPrecision,
            symbol: detail.symbol,
            type: "Native"
        }
        let network: Network = {
            name: detail.networkName,
            slug: detail.slug,
            logoUri: detail.networkIcon
        }
        return { asset, network }
    }
    return undefined
}

interface BlockchainDetail {
    slug: string
    symbol: string
    assetName: string
    assetIcon: string
    networkIcon: string
    decimals: number
    minPrecision: number
    networkName: string
}

export interface TransactionDetail {
    amount: number
    receiverAddress: string
    senderAddress: string
}

function toSimplifiedTransaction(transferOperation: TransferOperation | undefined): TransactionDetail | undefined {
    if (transferOperation !== undefined) {
        return {
            amount: transferOperation.amount.amount,
            receiverAddress: transferOperation.receiverAddress,
            senderAddress: transferOperation.senderAddress
        }
    }
    return undefined
}