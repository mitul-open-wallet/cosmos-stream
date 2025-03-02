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
    amount: string
    address: string
}

export interface TransferOperation {
    amount: number
    unit: string
    receiverAddress: string
    senderAddress: string
}

enum TransferEvent {
    received,
    sent
}

export interface QueuePayload {
    date: Date
    blockHeight: string
    txHash: string | undefined
    tipReceiver: TipReceiverItem[]
    feeAmount: string | undefined
    transferOperations: TransferOperation[]
}

type EventType = "tx" | "coin_spent" | "coin_received" | "transfer" | "message"