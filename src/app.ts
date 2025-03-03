import express, {Express, Request, Response } from 'express'
import { appConfig } from './config';
import { CosmosWalletMonitor } from './controllers/CosmosWalletMonitor';

const port = appConfig.port;
const app: Express = express();
const cosmosMonitor = new CosmosWalletMonitor("wss://cosmos-rpc.publicnode.com:443/websocket");

app.listen(port, () => {
    console.log(`server is running on: port ${port}`)
});

app.get('/check', async (req: Request, response: Response) => {
    await cosmosMonitor.bootstrap()
    response.status(200).send({"message": "hello"})
});

async function bootstrap() {
    await cosmosMonitor.bootstrap()
}

bootstrap();