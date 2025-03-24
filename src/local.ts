import { CosmosHubDataOrchestrator } from "./controllers/CosmosHubDataOrchestrator";
import { CosmosWalletMonitorController } from "./controllers/CosmosWalletMonitorController";
import { Blockchain } from "./models/model";

async function startObservingCosmosChain() {
    // let wsEndpoint = "wss://cosmos-rpc.publicnode.com:443/websocket"
    // const cosmosMonitor = new CosmosWalletMonitorController(wsEndpoint, (response) => {
    //     console.log("received")
    // })
    // await cosmosMonitor.bootstrap()
    const cosmosHubDataOrchestrator = new CosmosHubDataOrchestrator();
    cosmosHubDataOrchestrator.start();
}

// function split(by: string) {
//     let subject = "12500inj"
//     console.log(by)
//     let index = subject.indexOf(by)
//     console.log(index)
//     let num = subject.substring(0, index)
//     console.log(num)
// }

setTimeout(async () => {
    await startObservingCosmosChain()
}, 5000)