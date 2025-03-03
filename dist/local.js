"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const CosmosWalletMonitor_1 = require("./controllers/CosmosWalletMonitor");
const cosmosMonitor = new CosmosWalletMonitor_1.CosmosWalletMonitor("wss://cosmos-rpc.publicnode.com:443/websocket");
cosmosMonitor.bootstrap();
