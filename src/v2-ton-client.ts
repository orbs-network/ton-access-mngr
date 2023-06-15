
import { Address, Slice, TonClient, parseValidatorSet, TonTransaction } from "ton";
import BN from 'bn.js';
import { ElectorContract } from "ton-contracts"

function bnNanoTONsToTons(bn: BN): number {
    return bn.div(new BN(Math.pow(10, 9))).toNumber()
}

export async function v2Check(endpoint: string) {
    endpoint += '/jsonRPC';
    let client = new TonClient({
        endpoint: endpoint,
        apiKey: "orbs-gw5959"
    });

    let electorContract = new ElectorContract(client);
    let balance = await client.getBalance(electorContract.address);
    let tons = bnNanoTONsToTons(balance);
    if (tons <= 0)
        throw new Error('v2 elector balance failed');

    const res = await client.getTransactions(electorContract.address, { limit: 10 });
    if (res.length !== 10)
        throw new Error('v2 elector balance failed');
}