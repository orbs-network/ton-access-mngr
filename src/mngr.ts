import { v2Test } from "./v2-ton-client"
import { v4Test } from "./v4-ton-client"
import axios from 'axios';


// from ton-access lib
// type EdgeProtocol = "toncenter-api-v2" | "ton-api-v4" | "adnl-proxy"; // default: toncenter-api-v2
// type Network = "mainnet" | "testnet"; //| "sandbox"- is deprecated ; // default: mainnet
//type ProtoNet = "v2-mainnet" | "v2-testnet" | "v4-mainnet" | "v4-testnet";  //| "sandbox"- is deprecated ; // 

const AXIOS_TIMEOUT = 1500;

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

    constructor() {
        this.successTS = -1;
        this.errors = [];
        this.beName2Id = {};

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
    }
    async runLoop() {
        // await this.monitor();
        // setTimeout(this.runLoop.bind(this), 60 * 1000)
        console.log('start run loop')
        await this.monitor();
        console.log('first monitor tick done')
        setInterval(async () => {
            await this.monitor();
        }, 60 * 1000);
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
                node.Mngr = { error: `wrong health call http status ${res.status}` };
            }
        }
        catch (e) {
            node.Mngr = { error: e }
        }
    }
    async updateNodes() {
        // update nodes
        this.nodes = await this.getNodes();

        let calls = [];
        for (const node of this.nodes) {
            calls.push(this.updateNodeMngr(node));
        }
        await Promise.all(calls);
    }
    async monitor() {
        // each node keeps [nodes] structure with health of all nodes 
        try {
            await this.updateNodes();
        }
        catch (e) {
            console.error('failed to update nodes', e);
            return;
        }

        // reset local test         
        this.errors = [];
        this.health = {
            "v2-mainnet": false,
            "v2-testnet": false,
            "v4-mainnet": false,
            "v4-testnet": false
        }

        // make parallel
        let calls = [];
        calls.push(this.runTest(process.env.V2_MAINNET_ENDPOINT || "http://3.129.218.179:10001", v2Test));
        calls.push(this.runTest(process.env.V2_TESTNET_ENDPOINT || "http://3.129.218.179:10002", v2Test));

        calls.push(this.runTest(process.env.V4_MAINNET_ENDPOINT || "http://3.129.218.179:20001", v4Test));
        calls.push(this.runTest(process.env.V4_TESTNET_ENDPOINT || "http://3.129.218.179:20002", v4Test));

        const res = await Promise.all(calls);
        this.health['v2-mainnet'] = res[0];
        this.health['v2-testnet'] = res[1];
        this.health['v4-mainnet'] = res[2];
        this.health['v4-testnet'] = res[3];
        // this.health['v2-mainnet'] = await this.runTest(process.env.V2_MAINNET_ENDPOINT || "http://3.129.218.179:10001", v2Test);
        // this.health['v2-testnet'] = await this.runTest(process.env.V2_TESTNET_ENDPOINT || "http://3.129.218.179:10002", v2Test);

        // this.health['v4-mainnet'] = await this.runTest(process.env.V4_MAINNET_ENDPOINT || "http://3.129.218.179:20001", v4Test);
        // this.health['v4-testnet'] = await this.runTest(process.env.V4_TESTNET_ENDPOINT || "http://3.129.218.179:20002", v4Test);

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
        for (const backend of backends.data) {
            nodes.push({
                "NodeId": this.beName2Id[backend.name],
                "BackendName": backend.name,
                "Ip": backend.address,
                "Weight": backend.weight,
                "Healthy": "1"
            });
        }
        return nodes;
    }
    async runTest(endpoint: string, testFunc: (endpoint: string) => Promise<void>): Promise<boolean> {
        try {
            await testFunc(endpoint);
            return true;
        } catch (e: any) {
            console.error('monitor', e);
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
            code: code,
            text: (code === 200) ? 'OK' : text
        }
    }
}
