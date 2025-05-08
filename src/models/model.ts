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