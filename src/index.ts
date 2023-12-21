// Import the express in typescript file
import express from 'express';
import { Mngr } from './mngr';

const mngr = new Mngr();
mngr.runLoop();

// Initialize the express engine
const app: express.Application = express();

// Take a port 3000 for running server.
const port: number = 3000;

// Handling '/' Request

app.get('/', (_req, _res) => {
    _res.json(mngr.status);
});

app.get('/health', (_req, _res) => {
    if (mngr.status.atleastOneHealthy) {
        _res.status(200).send("OK");
    } else {
        _res.status(500).send("no protonet is healthy in this node");
    }
});

app.get('/status', (_req, _res) => {
    _res.status(mngr.status.code).send(mngr.status.text);
});

app.get('/nodes', (_req, _res) => {
    _res.status(200).send(mngr.nodes);
});
app.get('/v1/nodes', (_req, _res) => {
    _res.status(200).json(mngr.v1Nodes);
});

// Server setup
app.listen(port, () => {
    console.log(`ton-access-mngr Express listen at http://localhost:${port}/`);
});