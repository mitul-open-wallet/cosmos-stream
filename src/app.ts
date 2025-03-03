import express, {Express, Request, Response } from 'express'
import { appConfig } from './config';
import { CosmosWalletMonitor } from './controllers/CosmosWalletMonitor';

const port = appConfig.port;
const app: Express = express();

app.listen(port, () => {
    console.log(`server is running on: port ${port}`)
});

app.get('/check', async (req: Request, response: Response) => {
    response.status(200).send({"message": "hello"})
});