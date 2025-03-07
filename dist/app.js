"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const config_1 = require("./config");
const port = config_1.appConfig.port;
const app = (0, express_1.default)();
app.listen(port, () => {
    console.log(`server is running on: port ${port}`);
});
app.get('/check', (req, response) => __awaiter(void 0, void 0, void 0, function* () {
    response.status(200).send({ "message": "hello" });
}));
app.get('/bootstrap', (request, response) => __awaiter(void 0, void 0, void 0, function* () {
    response.status(200).send({ "message": "cosmos watcher started successfully" });
}));
