import { CosmosHubDataOrchestrator } from "./controllers/CosmosHubDataOrchestrator";

async function startObservingCosmosChain() {
    const cosmosHubDataOrchestrator = new CosmosHubDataOrchestrator();
    cosmosHubDataOrchestrator.bootstrap();
}

setTimeout(async () => {
    await startObservingCosmosChain()
}, 5000)