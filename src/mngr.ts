import { BlobOptions } from "buffer";
import { MonitorActivity } from "./v2-ton-client"

// from ton-access lib
// type EdgeProtocol = "toncenter-api-v2" | "ton-api-v4" | "adnl-proxy"; // default: toncenter-api-v2
// type Network = "mainnet" | "testnet"; //| "sandbox"- is deprecated ; // default: mainnet
//type ProtoNet = "v2-mainnet" | "v2-testnet" | "v4-mainnet" | "v4-testnet";  //| "sandbox"- is deprecated ; // 
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

    constructor() {
        this.successTS = -1;
        this.errors = [];
        const dt = new Date();
        this.status = {
            updated: dt.toUTCString(),
            code: 500,
            text: 'first check hasnt finished yet - server error: 500'
        }
    }
    async runLoop() {
        await this.monitor();
        setTimeout(this.runLoop.bind(this), 60 * 1000)
    }
    async monitor() {
        // reset         
        this.errors = [];
        this.health = {
            "v2-mainnet": false,
            "v2-testnet": false,
            "v4-mainnet": false,
            "v4-testnet": false
        }
        try {
            this.health['v2-mainnet'] = await this.Checkv2Mainnet();
            this.successTS = Date.now();
        }
        catch (e: any) {
            console.error('monitor', e);
            this.errors.push(e.message);
        }
        this.updateStatus();
    }
    async Checkv2Mainnet(): Promise<boolean> {
        try {
            await MonitorActivity()
            return true;
        } catch (e: any) {
            console.error('monitor', e);
            this.errors.push(e.message);
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
