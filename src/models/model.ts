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

export interface QueuePayload {
    date: Date
    blockHeight: string
    txHash: string | undefined
    tipReceiver: TipReceiverItem[]
    feeAmount: CryptoAmount | undefined
    transferOperations: TransferOperation[]
}

export type CosmosHubDataResponse = (payload: QueuePayload | undefined) => void

export interface PayloadParser {
    handleResponse(response: CosmosResponse): QueuePayload | undefined
}

export enum Blockchain {
    COSMOS_HUB = "cosmos_hub",
    INJECTIVE = "injective",
    CELESTIA = "celestia"
}

export function amountDenomination(blockchain: Blockchain): string {
    switch (blockchain) {
        case Blockchain.COSMOS_HUB: 
            return "uatom"
        case Blockchain.INJECTIVE: 
            return "inj"
        case Blockchain.CELESTIA: 
            return "utia"
    }
}