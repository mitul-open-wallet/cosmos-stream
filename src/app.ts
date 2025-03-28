import express, {Express, Request, Response } from 'express';
import { appConfig } from './config';

const port = appConfig.port;
const app: Express = express();

app.listen(port, () => {
    console.log(`server is running on: port ${port}`)
});

app.get('/check', async (req: Request, response: Response) => {
    response.status(200).send({"message": "hello"})
});

app.get('/bootstrap', async (request: Request, response: Response) => {
    response.status(200).send({"message": "cosmos watcher started successfully"})
})
