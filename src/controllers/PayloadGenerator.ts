import { appConfig } from "../config"
import { QueuePayload, CosmosResponse, TipReceiverItem, CryptoAmount, EventAttribute, TransferOperation, PayloadParser, Blockchain, amountDenomination } from "../models/model"

export class CosmosHubPayloadGenerator implements PayloadParser {

    amountDenomination: string

    constructor() {
        this.amountDenomination = amountDenomination(appConfig.blockchain)
    }

    handleResponse(response: CosmosResponse): QueuePayload | undefined {
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
                    console.log(feesList)
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
                                address: tipPayee!.value,
                                amount: this.separateValueAndUnit(tipPaidAmount!.value)
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
                    
                    let transferEvents = events.filter((event) => {
                        return event.type === "transfer"
                    })
                    if (events) {
                        const transferOperations = transferEvents?.map(event => {
                            let recipientAttribute = this.findValue(event.attributes, "recipient")
                            let senderAttribute = this.findValue(event.attributes, "sender")
                            let amountAttribute = this.findValue(event.attributes, "amount")
        
                            let transferOperation: TransferOperation | undefined
                
                            if (recipientAttribute && senderAttribute && amountAttribute) {
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
                                } else {
                                    return undefined
                                }
                            }
                            return transferOperation
                        })
                        .filter(operation => operation !== undefined)

                        let finalFees: CryptoAmount | undefined = undefined
                        if (feesList.length !== 0) {
                            finalFees = feesList[0]
                        } else {
                            finalFees = feeAmount.length !== 0 ? this.separateValueAndUnit(feeAmount[0]) : undefined
                        }
                        return {
                            date: new Date(),
                            blockHeight: blockHeight,
                            txHash: transactionHash.length !== 0 ? transactionHash[0] : undefined,
                            tipReceiver: tipPaidAmount,
                            feeAmount: finalFees,
                            transferOperations: transferOperations
                        } as QueuePayload
                    }
                }
            }
            return undefined
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