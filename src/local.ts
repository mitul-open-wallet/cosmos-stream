import { CosmosWalletMonitor } from "./controllers/CosmosWalletMonitor";

async function startObservingCosmosChain() {
    const cosmosMonitor = new CosmosWalletMonitor("wss://cosmos-rpc.publicnode.com:443/websocket");
    await cosmosMonitor.bootstrap()
}

setTimeout(async () => {
    await startObservingCosmosChain()
}, 5000)