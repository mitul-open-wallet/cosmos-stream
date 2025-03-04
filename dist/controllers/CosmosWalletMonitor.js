"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CosmosWalletMonitor = void 0;
const ws_1 = __importDefault(require("ws"));
const amqplib_1 = __importDefault(require("amqplib"));
const config_1 = require("../config");
class CosmosWalletMonitor {
    constructor(cosmosHubWebSocketEndpoint, rabbitMqUrl = config_1.appConfig.rabbitMqUrl) {
        this.rabbitMqUrl = rabbitMqUrl;
        this.websocket = undefined;
        this.rabbitMqChannel = undefined;
        this.rabbitMqConnection = undefined;
        this.reconnectTimer = undefined;
        this.maxReconnectionDelay = 30000;
        this.initialReconnectionDelay = 1000;
        this.reconnectAttempts = 0;
        this.isShuttingDown = false;
        this.isConnecting = false;
        this.cosmosHubWebSocketEndpoint = cosmosHubWebSocketEndpoint;
    }
    bootstrap() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.start();
            }
            catch (error) {
                console.error("websocket error", error);
            }
            yield this.setupRabbitMq();
        });
    }
    start() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isConnecting) {
                return Promise.resolve();
            }
            this.isConnecting = true;
            return new Promise((resolve, reject) => {
                try {
                    this.websocket = new ws_1.default(this.cosmosHubWebSocketEndpoint);
                    this.websocket.on('open', () => {
                        this.isConnecting = false;
                        console.log("Connected");
                        this.susbscribeToEvent();
                        resolve();
                    });
                    this.websocket.on('close', (code, reason) => {
                        console.log("Closed");
                        if (this.isShuttingDown === false) {
                            this.scheduleReconnect();
                        }
                    });
                    this.websocket.on('error', (error) => {
                        console.log(error);
                        if (this.reconnectAttempts === 0) {
                            reject(error);
                        }
                    });
                    this.websocket.on('message', (data) => {
                        let response = JSON.parse(data.toString());
                        this.handleResponse(response);
                    });
                }
                catch (error) {
                    this.isConnecting = false;
                    console.error("Error establishing websocket connection", error);
                    reject(error);
                }
            });
        });
    }
    forceRestart() {
        var _a;
        (_a = this.websocket) === null || _a === void 0 ? void 0 : _a.close();
        this.scheduleReconnect();
    }
    scheduleReconnect() {
        console.log(`scheduleReconnect ${this.reconnectAttempts}`);
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        if (this.reconnectAttempts > this.maxReconnectionDelay) {
            console.error(`Tried ${this.reconnectAttempts} to connect web socket, but failed so giving up`);
            return;
        }
        const delay = Math.min(this.maxReconnectionDelay * Math.pow(2, this.reconnectAttempts), this.maxReconnectionDelay);
        this.reconnectTimer = setTimeout(() => __awaiter(this, void 0, void 0, function* () {
            this.reconnectAttempts++;
            try {
                yield this.start();
            }
            catch (error) {
                this.scheduleReconnect();
            }
        }), delay);
    }
    setupRabbitMq() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                this.rabbitMqConnection = yield amqplib_1.default.connect(this.rabbitMqUrl);
                this.rabbitMqConnection = yield amqplib_1.default.connect(this.rabbitMqUrl);
                this.rabbitMqChannel = yield this.rabbitMqConnection.createChannel();
                this.rabbitMqChannel.assertExchange(config_1.appConfig.exchangeName, 'direct');
            }
            catch (error) {
                console.error("rabbitmq connection error", {
                    errorName: error,
                    errorMessage: error
                });
                throw error;
            }
        });
    }
    findValue(attributes, key) {
        return attributes.find(attribute => {
            return attribute.key === key;
        });
    }
    handleResponse(response) {
        var _a;
        const result = response.result;
        if (result) {
            const txResult = (_a = result.data) === null || _a === void 0 ? void 0 : _a.value.TxResult;
            let transactionHash = [""];
            let topLevelEvents = result.events;
            if (topLevelEvents) {
                transactionHash = topLevelEvents['tx.hash'];
            }
            if (txResult) {
                const blockHeight = txResult.height;
                const events = txResult.result.events;
                let tipPayEvents = events.filter(event => {
                    return event.type === "tip_pay";
                });
                let tipPaidAmount = tipPayEvents.map(tipPayEvent => {
                    let tipPaidAmount = this.findValue(tipPayEvent.attributes, "tip");
                    let tipPayee = this.findValue(tipPayEvent.attributes, "tip_payee");
                    if (tipPaidAmount && tipPayee) {
                        return {
                            address: tipPayee.value,
                            amount: tipPaidAmount.value
                        };
                    }
                    return undefined;
                })
                    .filter(item => item !== undefined);
                let feePayEvents = events.filter(event => {
                    return event.type === "fee_pay";
                });
                let feeAmount = feePayEvents === null || feePayEvents === void 0 ? void 0 : feePayEvents.map(feeEvent => {
                    let feeAttribute = this.findValue(feeEvent.attributes, "fee");
                    return feeAttribute === null || feeAttribute === void 0 ? void 0 : feeAttribute.value;
                }).filter(item => item !== undefined);
                let transferEvents = events.filter((event) => {
                    return event.type === "transfer";
                });
                if (events) {
                    const transferOperations = transferEvents === null || transferEvents === void 0 ? void 0 : transferEvents.map(event => {
                        let recipientAttribute = this.findValue(event.attributes, "recipient");
                        let senderAttribute = this.findValue(event.attributes, "sender");
                        let amountAttribute = this.findValue(event.attributes, "amount");
                        let transferOperation;
                        if (recipientAttribute && senderAttribute && amountAttribute) {
                            let decodedAmountValue = decodeBase64(amountAttribute.value);
                            let decodedReceiverVaule = decodeBase64(recipientAttribute.value);
                            let decodedSenderValue = decodeBase64(senderAttribute.value);
                            let amountValue = decodedAmountValue.split(",").find(item => item.endsWith("uatom"));
                            if (amountValue) {
                                const { actualValue, unit } = this.separateValueAndUnit(amountValue);
                                transferOperation = {
                                    amount: actualValue,
                                    unit: unit,
                                    receiverAddress: decodedReceiverVaule,
                                    senderAddress: decodedSenderValue
                                };
                            }
                            else {
                                return undefined;
                            }
                        }
                        return transferOperation;
                    }).filter(operation => operation !== undefined);
                    let payload = {
                        date: new Date(),
                        blockHeight: blockHeight,
                        txHash: transactionHash.length !== 0 ? transactionHash[0] : undefined,
                        tipReceiver: tipPaidAmount,
                        feeAmount: feeAmount.length !== 0 ? feeAmount[0] : undefined,
                        transferOperations: transferOperations
                    };
                    console.log(payload);
                    this.addMessageToChannel(payload);
                }
            }
        }
    }
    separateValueAndUnit(input) {
        let value = "";
        let unit = "";
        for (let i = 0; i < input.length; i++) {
            let char = input[i];
            if (char >= '0' && char <= '9') {
                value += char;
            }
            else {
                unit = input.substring(i);
                break;
            }
        }
        let actualValue = parseInt(value, 10);
        if (isNaN(actualValue) || unit === "") {
            throw new Error("cant derive number and unit");
        }
        return { actualValue, unit };
    }
    susbscribeToEvent() {
        if (this.websocket) {
            const event = {
                jsonrpc: '2.0',
                method: 'subscribe',
                id: 'txs',
                params: {
                    query: "tm.event='Tx'"
                }
            };
            this.websocket.send(JSON.stringify(event));
        }
    }
    addMessageToChannel(payload) {
        if (this.rabbitMqChannel) {
            let buffered = this.rabbitMqChannel.publish(config_1.appConfig.exchangeName, config_1.appConfig.cosmosHubRoutingKey, Buffer.from(JSON.stringify(payload)), {
                persistent: true, // Message survives broker restart
                contentType: 'application/json'
            });
            console.log(`buffered to channel: ${buffered}`);
        }
        else {
            console.log("no channel found");
        }
    }
    stop() {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                var _a;
                (_a = this.websocket) === null || _a === void 0 ? void 0 : _a.on('close', () => {
                    console.log("Closed");
                    resolve();
                });
            });
        });
    }
}
exports.CosmosWalletMonitor = CosmosWalletMonitor;
// base 64 encode and decode
function isBase64(str) {
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    return base64Regex.test(str) && (str.length % 4) === 0;
}
function decodeBase64(string) {
    return isBase64(string) ? Buffer.from(string, 'base64').toString('utf-8') : string;
}
