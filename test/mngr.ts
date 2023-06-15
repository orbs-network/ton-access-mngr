import { expect } from 'chai';
import { Mngr } from '../src/mngr';
import { sleep } from '../src/helper';
import { resolve } from 'path';

describe('Mngr', async function () {
    // mainnet
    this.timeout(60000);
    it('should return valid json from mngr', async () => {
        const mngr = new Mngr();
        console.log('waiting for first tick to finish');
        await mngr.runLoop();

        while (mngr.status.text !== 'OK') {
            console.log('waiting for status ok...');
            await sleep(1000)
        }

        expect(mngr.status.text).eq('OK');
        expect(mngr.nodes.length).above(0);

        expect(mngr.status.health['v2-mainnet']).eq(true);
        expect(mngr.status.health['v2-testnet']).eq(true);
        expect(mngr.status.health['v4-mainnet']).eq(true);
        expect(mngr.status.health['v4-testnet']).eq(true);

        mngr.stopLoop();
        resolve();
    });
});