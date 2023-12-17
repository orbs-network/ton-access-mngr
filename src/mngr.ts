import { v2Check } from "./v2-ton-client"
import { v4Check } from "./v4-ton-client"
import { sleep } from './helper';
import axios from 'axios';


// from ton-access lib
// type EdgeProtocol = "toncenter-api-v2" | "ton-api-v4" | "adnl-proxy"; // default: toncenter-api-v2
// type Network = "mainnet" | "testnet"; //| "sandbox"- is deprecated ; // default: mainnet
// type ProtoNet = "v2-mainnet" | "v2-testnet" | "v4-mainnet" | "v4-testnet";

const AXIOS_TIMEOUT = 5000;

type ProtoNetHealth = {
    "v2-mainnet": boolean,
    "v2-testnet": boolean,
    "v4-mainnet": boolean,
    "v4-testnet": boolean
}

export class Mngr {
    health: ProtoNetHealth | undefined;
    successTS: number;
    errors: Array<string>;
    status: any;
    edgeSvcUrl: string;
    edgeHeaders: any;
    beName2Id: any;
    nodes: any;
    v1Nodes: any[];
    running: boolean;
    atleastOneHealthy: boolean;

    constructor() {
        this.successTS = -1;
        this.errors = [];
        this.beName2Id = {};
        this.running = false;
        this.v1Nodes = [];

        const dt = new Date();

        this.status = {
            updated: dt.toUTCString(),
            code: 500,
            text: 'first check hasnt finished yet - server error: 500'
        }

        this.edgeSvcUrl = `https://api.fastly.com/service/${process.env.FASTLY_SERVICE_ID}`;
        this.edgeHeaders = {
            'Fastly-Key': process.env.FASTLY_API_KEY,
            'Accept': 'application/json'
        }
        this.atleastOneHealthy = false;

    }
    stopLoop() {
        this.running = false;
    }
    async runLoop() {
        this.running = true;
        console.log('start run loop')
        await this.monitor();
        console.log('first monitor tick done')
        while (this.running) {
            await this.monitor();
            await sleep(60 * 1000);

        }
        // this.tsid = setInterval(async () => {
        //     await this.monitor();
        // }, 60 * 1000);

    }
    async updateNodeMngr(node: any) {
        try {
            const url = `http://${node.Ip}/mngr/`;
            const res = await axios.get(url, {
                headers: this.edgeHeaders,
                timeout: AXIOS_TIMEOUT
            });
            if (res.status === 200) {
                node.Mngr = res.data;
            }
            else {
                const msg = `wrong health call http status ${res.status}`;
                console.error(msg)
                node.Mngr = { error: msg };
            }
        }
        catch (e) {
            node.Mngr = { error: e }
        }
    }
    async updateNodes() {
        // update nodes
        let nodes = []
        try {
            nodes = await this.getNodes();
        }
        catch (e) {
            console.error('failed to get nodes from fastly')
            console.error(e)
            return
        }

        // call serial
        for (const node of nodes) {
            await this.updateNodeMngr(node);
        }
        return nodes;
    }
    async monitor() {
        // each node keeps [nodes] structure with health of all nodes 
        try {
            this.nodes = await this.updateNodes();
        }
        catch (e) {
            console.error('failed to update nodes', e);
        }

        // reset local test         
        this.errors = [];
        this.health = {
            "v2-mainnet": false,
            "v2-testnet": false,
            "v4-mainnet": false,
            "v4-testnet": false
        }
        // reset healthy flag
        this.atleastOneHealthy = false;

        // make serial for caution
        this.health['v2-mainnet'] = await this.runTest(process.env.V2_MAINNET_ENDPOINT || "http://ton-access-dev:10001", v2Check);
        this.health['v2-testnet'] = await this.runTest(process.env.V2_TESTNET_ENDPOINT || "http://ton-access-dev:10002", v2Check);
        this.health['v4-mainnet'] = await this.runTest(process.env.V4_MAINNET_ENDPOINT || "http://ton-access-dev:20001", v4Check);
        this.health['v4-testnet'] = await this.runTest(process.env.V4_TESTNET_ENDPOINT || "http://ton-access-dev:20002", v4Check);

        this.successTS = Date.now();
        this.updateStatus();
    }
    //////////////////////////////////////////////////
    async callEdgeApi(method: string) {
        const url = `${this.edgeSvcUrl}/${method}`;
        return await axios.get(url, {
            headers: this.edgeHeaders,
            timeout: AXIOS_TIMEOUT
        });
    }
    //////////////////////////////////////////////////
    async getNodes() {
        // get active version
        const version = await this.callEdgeApi(`version/active`);
        // get backend names
        const table = await this.callEdgeApi(`version/${version.data.number}/dictionary/beName2Id`);
        // get items
        const items = await this.callEdgeApi(`dictionary/${table.data.id}/items`);
        // populate
        this.beName2Id = {}
        for (const item of items.data) {
            this.beName2Id[item.item_key] = item.item_value;
        }

        // get backends edge api
        const backends = await this.callEdgeApi(`version/${version.data.number}/backend`);
        const nodes = [];
        this.v1Nodes = [];

        // iterate through fastly backends        
        for (const backend of backends.data) {
            // ignore backends which are not in beName2Id table
            // as beName2Id-U-Installed Backends, becomes the single source of truth for both v1 and v2 
            if (this.beName2Id.hasOwnProperty(backend.name)) {
                let healthy = "0";
                try {
                    if (backend.healthcheck) {
                        // get healthcheck obj associated with the backend
                        const hc = await this.callEdgeApi(`version/${version.data.number}/healthcheck/${backend.healthcheck}`);
                        // create healthcheck url
                        const hcUrl = `http://${backend.ipv4}/${hc.data.path}`;
                        // perform healthcheck
                        const hcRes = await axios.get(hcUrl, {
                            timeout: AXIOS_TIMEOUT
                        });
                        healthy = hcRes.status === hc.data?.expected_response ? "1" : "0";
                    }
                    else {
                        // healthcheck not installed, assumes healthy
                        healthy = "1";
                    }
                } catch (e) {
                    console.error("helathecheck error", e);
                }

                // latest /mngr/nodes format
                nodes.push({
                    "NodeId": this.beName2Id[backend.name],
                    "BackendName": backend.name,
                    "Ip": backend.address,
                    "Weight": backend.weight,
                    "Healthy": healthy
                });
                this.v1Nodes.push({
                    "Name": this.beName2Id[backend.name],
                    "BackendName": backend.name,
                    "Ip": backend.address,
                    "Healthy": healthy
                });
            }
        }
        return nodes;
    }
    async runTest(endpoint: string, testFunc: (endpoint: string) => Promise<void>): Promise<boolean> {
        try {
            await testFunc(endpoint);
            // thats the health of the node!            
            this.atleastOneHealthy = true;
            // its being reset before all runTest calls
            return true;
        } catch (e: any) {
            console.error(`runTest error "${endpoint}":`, e.message);
            this.errors.push(e.message + ' - endpoint: ' + endpoint);
            return false;
        }
    }
    updateStatus(): any {
        let code = 200;
        let text = '';
        if (this.errors.length) {
            text += `${this.errors.length} exceptions has been thrown\t\n`;
            code = 500;
        }
        const successDiffMin = Math.round((Date.now() - this.successTS) / (60 * 1000));
        if (successDiffMin > 2) {
            text += `success Timeout is greater than 2 minutes: ${successDiffMin} minutes\t\n`;
            code = 500;
        }

        if (code === 500) {
            text += `server error 500`;
        }

        const dt = new Date();
        this.status = {
            updated: dt.toUTCString(),
            health: this.health,
            successTS: this.successTS,
            errors: this.errors,
            atleastOneHealthy: this.atleastOneHealthy,
            code: code,
            text: (code === 200) ? 'OK' : text
        }
    }
}
