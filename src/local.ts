import { CosmosWalletMonitor } from "./controllers/CosmosWalletMonitor";

const cosmosMonitor = new CosmosWalletMonitor("wss://cosmos-rpc.publicnode.com:443/websocket");
cosmosMonitor.bootstrap()

// setTimeout(async () => {
//     cosmosMonitor.forceRestart()
// }, 10000)