import { appConfig } from "../config"
import { QueuePayload, CosmosResponse, CryptoAmount, EventAttribute, TransferOperation, PayloadParser, amountDenomination, queuePayloadDummy } from "../models/model"

export class GenericPayloadGenerator implements PayloadParser {

    amountDenomination: string

    constructor() {
        this.amountDenomination = amountDenomination(appConfig.blockchain)
    }

    handleResponse(response: CosmosResponse): QueuePayload {
        const result = response.result
        if (result) {
            const txResult = result.data?.value.TxResult
            let transactionHash = [""]
            let topLevelEvents = result.events
            if (txResult && topLevelEvents) {
                const action = topLevelEvents["message.action"]
                if (action && action.length !== 0 && action[0] === "/cosmos.bank.v1beta1.MsgSend") {
                    const blockHeight = txResult.height
                    const events = txResult.result.events
                    transactionHash = topLevelEvents['tx.hash']

                    let feePayEvents = events.filter(event => {
                        return event.type === "fee_pay"
                    })
                    let feeAmount = feePayEvents?.map(feeEvent => {
                        let feeAttribute = this.findValue(feeEvent.attributes, "fee")
                        return feeAttribute?.value
                    })
                    .filter(item => item !== undefined)

                    let finalFees: number | undefined = undefined
                    if (feeAmount.length !== 0) {
                        finalFees = this.separateValueAndUnit(feeAmount[0]).amount
                    }

                    let transferEvents = events.filter((event) => {
                        return event.type === "transfer"
                    })
                    if (events) {
                        // Find the actual transfer
                        const transferOperations = transferEvents?.map(event => {
                            let recipientAttribute = this.findValue(event.attributes, "recipient")
                            let senderAttribute = this.findValue(event.attributes, "sender")
                            let amountAttribute = this.findValue(event.attributes, "amount")
                            let messageAttribute = this.findValue(event.attributes, "msg_index")
                            let transferOperation: TransferOperation | undefined

                            if (recipientAttribute && senderAttribute && amountAttribute && messageAttribute) {
                                let decodedAmountValue = amountAttribute.value
                                let decodedReceiverVaule = recipientAttribute.value
                                let decodedSenderValue = senderAttribute.value

                                let amountValue = decodedAmountValue.split(",").find(item => item.endsWith(this.amountDenomination))
                                if (amountValue) {
                                    transferOperation = {
                                        amount: this.separateValueAndUnit(amountValue),
                                        receiverAddress: decodedReceiverVaule,
                                        senderAddress: decodedSenderValue
                                    }
                                }
                            }
                            return transferOperation
                        })
                            .filter(operation => operation !== undefined)
                        // now find the transfer which denotes the fee

                        const senderAddress = transferOperations[0]?.senderAddress
                        const amountTransferred = transferOperations[0]?.amount

                        events.filter(item => {
                            return item.type === "coin_spent"
                        })
                        .forEach(event => {
                            let spenderFound = this.findValue(event.attributes, "spender")?.value === senderAddress
                            let feeValue = this.findValue(event.attributes, "amount")?.value
                            if (feeValue && spenderFound) {
                                let feeAmount = this.separateValueAndUnit(feeValue).amount
                                if (feeAmount !== amountTransferred.amount) {
                                    finalFees = this.separateValueAndUnit(feeValue).amount
                                }
                            }
                        })
                        return {
                            date: new Date(),
                            blockHeight: blockHeight,
                            txHash: transactionHash.length !== 0 ? transactionHash[0] : undefined,
                            tipReceiver: [],
                            feeAmount: finalFees,
                            transaction: transferOperations.length !== 0 ? transferOperations[0] : undefined
                        } as QueuePayload
                    }
                } else {
                    return queuePayloadDummy

                }
            }
        }
        return queuePayloadDummy
    }

    private separateValueAndUnit(input: string): CryptoAmount {
        let value = ""
        let unit = ""
        for (let i = 0; i < input.length; i++) {
            let char = input[i]
            if (char >= '0' && char <= '9') {
                value += char
            } else {
                unit = input.substring(i)
                break
            }
        }

        let amount = parseInt(value, 10)

        if (isNaN(amount) || unit === "") {
            throw new Error("cant derive number and unit")
        }
        return { amount, unit }
    }

    private findValue(attributes: EventAttribute[], key: string): EventAttribute | undefined {
        return attributes.find(attribute => {
            return attribute.key === key
        })
    }
}

export class Base64PayloadGenerator implements PayloadParser {

    amountDenomination: string

    constructor() {
        this.amountDenomination = amountDenomination(appConfig.blockchain)
    }

    handleResponse(response: CosmosResponse): QueuePayload {
        const result = response.result
        if (result) {
            const txResult = result.data?.value.TxResult
            let transactionHash = [""]
            let topLevelEvents = result.events
            if (txResult && topLevelEvents) {
                const action = topLevelEvents["message.action"]
                if (action && action.length !== 0 && action[0] === "/cosmos.bank.v1beta1.MsgSend") {
                    transactionHash = topLevelEvents['tx.hash']
                    const blockHeight = txResult.height
                    const events = txResult.result.events
    
                    let transferEvents = events.filter((event) => {
                        return event.type === "transfer"
                    })
                    if (events) {
                        // Find the actual transfer
                        const transferOperations = transferEvents?.map(event => {
                            let recipientAttribute = this.findValue(event.attributes, this.encodeToBase64("recipient"))
                            let senderAttribute = this.findValue(event.attributes, this.encodeToBase64("sender"))
                            let amountAttribute = this.findValue(event.attributes, this.encodeToBase64("amount"))
                            let transferOperation: TransferOperation | undefined
    
                            if (recipientAttribute && senderAttribute && amountAttribute) {
                                let decodedAmountValue = this.decodeBase64(amountAttribute.value)
                                let decodedReceiverVaule = this.decodeBase64(recipientAttribute.value)
                                let decodedSenderValue = this.decodeBase64(senderAttribute.value)
    
    
                                let amountValue = decodedAmountValue.split(",").find(item => item.endsWith(this.amountDenomination))
                                if (amountValue) {
                                    transferOperation = {
                                        amount: this.separateValueAndUnit(amountValue),
                                        receiverAddress: decodedReceiverVaule,
                                        senderAddress: decodedSenderValue
                                    }
                                }
                            }
                            return transferOperation
                        })
                        .filter(operation => operation !== undefined)

                        let feeEvents = events.filter(event => {
                            return event.type === "tx"
                        })
                        .map(event => {
                            let fee = this.findValue(event.attributes, this.encodeToBase64("fee"))?.value
                            let feePayer = this.findValue(event.attributes, this.encodeToBase64("fee_payer"))?.value
                            if (fee && feePayer) {
                                let decodedFee = this.decodeBase64(fee)
                                let actualFee = this.separateValueAndUnit(decodedFee)
                                let feePayingAddress = this.decodeBase64(feePayer)
                                return {txFee: actualFee, payer: feePayingAddress}
                            } else {
                                return undefined
                            }
                        })
                        let transactionFee: CryptoAmount | undefined
                        transferOperations.forEach(transfer => {
                            let senderFound = feeEvents.find(item => {
                                return item?.payer === transfer.senderAddress
                            })
                            if (senderFound && transactionFee === undefined) {
                                transactionFee = senderFound.txFee
                            }
                        })
                        let concernedTransferOperation = transferOperations.filter(operation => {
                            return operation.amount.amount !== transactionFee?.amount
                        })
                        return {
                            date: new Date(),
                            blockHeight: blockHeight,
                            txHash: transactionHash.length !== 0 ? transactionHash[0] : undefined,
                            tipReceiver: [],
                            feeAmount: transactionFee?.amount,
                            transaction: concernedTransferOperation.length === 0 ? undefined : concernedTransferOperation[0] 
                        } as QueuePayload
                    }
                }
            }
        }
        return queuePayloadDummy
    }

    private separateValueAndUnit(input: string): CryptoAmount {
        let value = ""
        let unit = ""
        for (let i = 0; i < input.length; i++) {
            let char = input[i]
            if (char >= '0' && char <= '9') {
                value += char
            } else {
                unit = input.substring(i)
                break
            }
        }

        let amount = parseInt(value, 10)

        if (isNaN(amount) || unit === "") {
            throw new Error("cant derive number and unit")
        }
        return { amount, unit }
    }

    private findValue(attributes: EventAttribute[], key: string): EventAttribute | undefined {
        return attributes.find(attribute => {
            return attribute.key === key
        })
    }

    private decodeBase64(string: string) {
        return this.isBase64(string) ? Buffer.from(string, 'base64').toString('utf-8') : string
    }

    private isBase64(str: string): boolean {
        const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
        return base64Regex.test(str) && (str.length % 4) === 0;
    }

    private encodeToBase64(str: string): string {
        return Buffer.from(str).toString('base64');
    }
}
