import { CosmosWalletMonitor } from "./controllers/CosmosWalletMonitor";

async function main() {
    const cosmosMonitor = new CosmosWalletMonitor("wss://cosmos-rpc.publicnode.com:443/websocket");
    await cosmosMonitor.bootstrap()
}

main();