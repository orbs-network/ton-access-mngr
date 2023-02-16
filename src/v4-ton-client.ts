//import AllConfig from "./config.json"
import { TonClient4, Address } from "ton";
import BN from "bn.js";

// gets the first account in the first shards's transactions
export async function v4Test(endpoint: string) {

    const client4 = new TonClient4({ endpoint }); // initialize ton library

    // make some query to mainnet
    const latestBlock = await client4.getLastBlock();
    const seqno = latestBlock.last.seqno;

    let blk = await client4.getBlock(seqno);
    let txs = blk.shards[0].transactions;
    let hash = Buffer.from(txs[0].hash, 'base64');
    let tx2 = await client4.getAccountTransactions(Address.parse(txs[0].account), new BN(txs[0].lt, 10), hash);
    if (tx2.length <= 0)
        throw new Error('getAccountTransactions return empty')
}
