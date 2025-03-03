"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.appConfig = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.appConfig = (() => {
    var _a, _b, _c, _d;
    return {
        port: (_a = process.env.PORT) !== null && _a !== void 0 ? _a : "3000",
        exchangeName: (_b = process.env.EXCHANGE_NAME) !== null && _b !== void 0 ? _b : "",
        cosmosHubRoutingKey: (_c = process.env.COSMOS_HUB_ROUTING_KEY) !== null && _c !== void 0 ? _c : "",
        rabbitMqUrl: (_d = process.env.RABBIT_MQ_URL) !== null && _d !== void 0 ? _d : ""
    };
})();
