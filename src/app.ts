import express, {Express, Request, Response } from 'express'
import { appConfig } from './config';
import { CosmosWalletMonitor } from './controllers/CosmosWalletMonitor';

const port = appConfig.port;
const app: Express = express();
const cosmosMonitor = new CosmosWalletMonitor("wss://cosmos-rpc.publicnode.com:443/websocket");
console.log(`the server will run on port: ${port} rabbitmq: ${appConfig.rabbitMqUrl}`)

app.listen(port, () => {
    console.log(`server is running on: port ${port}`)
});

app.get('/check', async (req: Request, response: Response) => {
    response.status(200).send({"message": "hello"})
});

app.get('/bootstrap', async (request, response) => {
    await cosmosMonitor.bootstrap()
    response.status(200).send({"message": "cosmos watcher started successfully"})
})