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
    _res.status(mngr.status.code).send(mngr.status.text);
});

app.get('/nodes', (_req, _res) => {
    _res.status(200).send(mngr.nodes);
});

// Server setup
app.listen(port, () => {
    console.log(`ton-access-mngr Express listen at http://localhost:${port}/`);
});