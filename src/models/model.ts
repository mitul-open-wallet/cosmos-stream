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

enum TransferEvent {
    received,
    sent
}

export interface QueuePayload {
    date: Date
    blockHeight: string
    txHash: string | undefined
    tipReceiver: TipReceiverItem[]
    feeAmount: CryptoAmount | undefined
    transferOperations: TransferOperation[]
}