import { appConfig } from "../config"
import { QueuePayload, CosmosResponse, TipReceiverItem, CryptoAmount, EventAttribute, TransferOperation, PayloadParser, Blockchain, amountDenomination, queuePayloadDummy } from "../models/model"

export class CosmosHubPayloadGenerator implements PayloadParser {

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
                let feesList: CryptoAmount[] = []
                if (topLevelEvents) {
                    transactionHash = topLevelEvents['tx.hash']
                    let feesArray = topLevelEvents["tx.fee"]
                    if (feesArray !== undefined) {
                        feesList = feesArray.map(item => {
                            return this.separateValueAndUnit(item)
                        })
                    }
                }
        
                if (txResult) {
                    const blockHeight = txResult.height
                    const events = txResult.result.events
                    
                    let tipPayEvents = events.filter(event => {
                        return event.type === "tip_pay"
                    })
                    let tipPaidAmount = tipPayEvents.map(tipPayEvent => {
                        let tipPaidAmount = this.findValue(tipPayEvent.attributes, "tip")
                        let tipPayee = this.findValue(tipPayEvent.attributes, "tip_payee")
                        if (tipPaidAmount && tipPayee) {
                            return {
                                address: tipPayee.value,
                                amount: this.separateValueAndUnit(tipPaidAmount.value)
                            } as TipReceiverItem
                        }
                        return undefined
                    })
                    .filter(item => item !== undefined)

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

                        transferEvents.forEach(event => {
                            let senderFound = this.findValue(event.attributes, "sender")?.value === senderAddress
                            if (senderFound) {
                                console.log(`>> found sender`)
                                let feeValue = this.findValue(event.attributes, "amount")?.value
                                if (this.findValue(event.attributes, "msg_index") === undefined && feeValue) {
                                    finalFees = this.separateValueAndUnit(feeValue).amount
                                }
                            }
                        })
                        return {
                            date: new Date(),
                            blockHeight: blockHeight,
                            txHash: transactionHash.length !== 0 ? transactionHash[0] : undefined,
                            tipReceiver: tipPaidAmount,
                            feeAmount: finalFees,
                            transaction: transferOperations.length !== 0 ? transferOperations[0] : undefined
                        } as QueuePayload
                    }
                }
            }
            console.log(`returning dummy: ${result}`)
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
}