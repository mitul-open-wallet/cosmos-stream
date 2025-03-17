import { CosmosHubDataOrchestrator } from "./controllers/CosmosHubDataOrchestrator";
import { CosmosWalletMonitorController } from "./controllers/CosmosWalletMonitorController";

async function startObservingCosmosChain() {
    // let wsEndpoint = "wss://cosmos-rpc.publicnode.com:443/websocket"
    // const cosmosMonitor = new CosmosWalletMonitorController(wsEndpoint, (response) => {
    //     console.log("received")
    // })
    // await cosmosMonitor.bootstrap()
    const cosmosHubDataOrchestrator = new CosmosHubDataOrchestrator();
    cosmosHubDataOrchestrator.start();
}

setTimeout(async () => {
    await startObservingCosmosChain()
}, 5000)