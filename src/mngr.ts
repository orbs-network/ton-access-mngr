import { MonitorActivity } from "./v2-ton-client"

export class Mngr {
    v2Mainnet: boolean;
    successTS: number;
    errors: Array<string>;
    status: any;

    constructor() {
        this.successTS = -1;
        this.errors = [];
        this.v2Mainnet = false;
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
        this.v2Mainnet = false;
        this.errors = [];
        try {
            this.v2Mainnet = await this.Checkv2Mainnet();
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
            v2Mainnet: this.v2Mainnet,
            successTS: this.successTS,
            errors: this.errors,
            code: code,
            text: (code === 200) ? 'OK' : text
        }
    }
}
