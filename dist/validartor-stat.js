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
const ton_1 = require("ton");
const bn_js_1 = __importDefault(require("bn.js"));
const ton_contracts_1 = require("ton-contracts");
const config_json_1 = __importDefault(require("./config.json"));
const axios_1 = __importDefault(require("axios"));
const MIN_STAKE = 300000;
const MIN_TOPUP_BALANCE = 100;
const MIN_APR_FOR_COLLECTING = 50000;
const DEBUG = false;
// async function sendToKibana(oo: any) {
//     //console.log("kibana->",oo);return;
//     await axios.get('http://logs.orbs.network:3001/putes/ton-validators', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         data: JSON.stringify(oo),
//     })
// }
function SendAlert(alert) {
    console.log("Alert: ", alert);
    let url = "https://api.telegram.org/bot5673887102:AAEJqQ7TxGXDYtnVvSn2NnQ2U9Mb2EmNNEQ/sendMessage?chat_id=-838471030&parse_mode=markdown&text=";
    axios_1.default.get(url + encodeURI(alert));
}
function GetName(addr, forTG = false) {
    //@ts-ignore
    let name = config_json_1.default.Names[addr];
    if (!name)
        name = "";
    if (forTG)
        return "<" + name + ">: [" + addr + "](https://tonscan.org/address/+" + addr + ")";
    else
        return "<" + name + ">: " + addr;
}
function GetTxSafe(client, addr, limit = 20) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if (limit == 0)
                return [];
            return yield client.getTransactions(addr, { limit: limit });
        }
        catch (e) {
            //console.log("GetTX failed - curr limit:",limit);
            return yield GetTxSafe(client, addr, limit - 1);
        }
    });
}
function GetWalletTxs(addr, client) {
    return __awaiter(this, void 0, void 0, function* () {
        let orders = [];
        let txs = yield GetTxSafe(client, addr);
        txs.forEach((tx) => {
            var _a, _b, _c, _d;
            let outMsg = tx.inMessage && tx.outMessages.length > 0;
            let inMsg = tx.inMessage && !outMsg;
            //console.log(tx);
            if (tx.inMessage)
                orders.push({
                    value: bnNanoTONsToTons(inMsg ? tx.inMessage.value : outMsg ? tx.outMessages[0].value : new bn_js_1.default(0)),
                    in_out: inMsg ? "in" : outMsg ? "out" : "none",
                    source: inMsg ? (_a = tx.inMessage.source) === null || _a === void 0 ? void 0 : _a.toFriendly() : outMsg ? (_b = tx.outMessages[0].source) === null || _b === void 0 ? void 0 : _b.toFriendly() : "",
                    destination: inMsg ? (_c = tx.inMessage.destination) === null || _c === void 0 ? void 0 : _c.toFriendly() : outMsg ? (_d = tx.outMessages[0].destination) === null || _d === void 0 ? void 0 : _d.toFriendly() : "",
                    time: new Date(tx.time * 1000)
                });
        });
        return orders;
    });
}
function ValidatorsBalance(client, snmAddr) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        let electorContract = new ton_contracts_1.ElectorContract(client);
        let elEnt = yield electorContract.getElectionEntities();
        let ents = elEnt.entities;
        let pastEl = yield electorContract.getPastElections();
        let vset = yield GetCurrentValidators(client);
        //Try to find if already in elections
        let found = false;
        let foundElectStake = 0;
        let foundEnt = ents.find(ent => ent.address.equals(snmAddr));
        if (foundEnt) {
            foundElectStake = bnNanoTONsToTons(foundEnt.stake);
        }
        //Check if in Validator active set   
        let stakeinValidation = vset === null || vset === void 0 ? void 0 : vset.get(snmAddr.toFriendly());
        let foundValidationStaked = 0;
        if (stakeinValidation) {
            foundValidationStaked = bnNanoTONsToTons(stakeinValidation);
        }
        //look for frozen       
        let index = 0;
        let electId = (_a = vset === null || vset === void 0 ? void 0 : vset.get("vid")) === null || _a === void 0 ? void 0 : _a.toNumber();
        let foundFrozenStake = 0;
        //find the prev one and ignore the one in validation now
        let foundPastEl = pastEl.find(el => el.id != electId);
        if (foundPastEl) {
            let frozen = foundPastEl.frozen;
            let entFound = [...frozen.values()].find(ent => ent.address.equals(snmAddr));
            if (entFound)
                foundFrozenStake = bnNanoTONsToTons(entFound.stake);
        }
        //Wallet balnce - APR
        let foundBalance = bnNanoTONsToTons(yield client.getBalance(snmAddr));
        //Check for unclaimed
        let foundStakeNotClaimed = bnNanoTONsToTons(yield electorContract.getReturnedStake(snmAddr));
        let total = foundStakeNotClaimed + foundBalance + foundElectStake + foundFrozenStake + foundValidationStaked;
        let res = yield GetWalletTxs(snmAddr, client);
        let outTxs = 0;
        let lastStaked = 0;
        let lastReturned = 0;
        res.forEach((r) => __awaiter(this, void 0, void 0, function* () {
            if (r.in_out == "out" &&
                r.value > MIN_STAKE &&
                r.destination &&
                electorContract.address.equals(ton_1.Address.parse(r.destination)) &&
                GetHoursSince(r.time) < 24) {
                outTxs++;
                lastStaked = lastStaked ? lastStaked : r.value;
            }
            if (r.in_out == "in" &&
                r.value > MIN_STAKE &&
                r.source &&
                electorContract.address.equals(ton_1.Address.parse(r.source)) &&
                GetHoursSince(r.time) < 24) {
                lastReturned = r.value;
            }
        }));
        lastStaked--; //reduce the fee sent
        let reward = lastReturned - (lastStaked);
        let estimateAPY = 100 * reward * 365 * 24 / (Math.pow(2, 16) / 3600) / 2 / (lastStaked);
        //console.log(estimateAPY);
        if (DEBUG) {
            console.log("==========    Checking SNM Wallet:", GetName(snmAddr.toFriendly()));
            console.log("found balance in wallet:", foundBalance);
            console.log("Found stake in election (pre)", foundElectStake);
            console.log("Found In Currenct Validation:", foundValidationStaked);
            console.log("found stake frozen:", foundFrozenStake);
            console.log("found returnedStake:", foundStakeNotClaimed);
            console.log("Last APY:", estimateAPY);
            console.log("Total:", total);
        }
        return {
            snmWallet: snmAddr.toFriendly(),
            notClaimed: foundStakeNotClaimed,
            balance: foundBalance,
            validationStaked: foundValidationStaked,
            frozened: foundFrozenStake,
            electionStaked: foundElectStake,
            total: total,
            lastDayTxs: outTxs,
            APY: estimateAPY
        };
    });
}
function configParseValidatorSet(slice) {
    if (!slice) {
        return null;
    }
    return (0, ton_1.parseValidatorSet)(slice);
}
function bnNanoTONsToTons(bn) {
    return bn.div(new bn_js_1.default(Math.pow(10, 9))).toNumber();
}
function GetCurrentValidators(client) {
    return __awaiter(this, void 0, void 0, function* () {
        //let configs = await client.services.configs.getConfigs(); //getConfigReliable();
        let configs = yield client.services.configs.getConfigsRaw();
        //let s = configParseValidatorSet(configs.get('32'));
        let set1 = configParseValidatorSet(configs.get('34')); //this is the active set
        let elector = new ton_contracts_1.ElectorContract(client);
        let elections = yield elector.getPastElections();
        let ex = elections.find(v => v.id === set1.timeSince);
        if (!(set1 === null || set1 === void 0 ? void 0 : set1.list) || !ex)
            return;
        let lst = set1 === null || set1 === void 0 ? void 0 : set1.list;
        let all = new Map();
        [...lst.values()].map((entity) => {
            if (ex) {
                let frozen = ex.frozen;
                let entry = frozen.get(new bn_js_1.default(entity.publicKey, 'hex').toString());
                if (entry)
                    all.set(entry.address.toFriendly(), entry.stake);
            }
        });
        all.set("vid", new bn_js_1.default(set1.timeSince));
        return all;
    });
}
function GetHoursSince(date) {
    let diff = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60));
    return diff;
}
function CheckTopUpWallets(client, tWlt) {
    return __awaiter(this, void 0, void 0, function* () {
        let foubndBalance = bnNanoTONsToTons(yield client.getBalance(tWlt));
        let txs = yield GetWalletTxs(tWlt, client);
        let cLastDayOutTxs = 0;
        txs.forEach(tx => {
            if (tx.in_out === "out" && GetHoursSince(tx.time) < 24)
                cLastDayOutTxs++;
        });
        if (DEBUG) {
            console.log("=== checking TopUp Wallet:", GetName(tWlt.toFriendly()));
            console.log("Found balance: ", foubndBalance);
            console.log("Found out Txs in last day:", cLastDayOutTxs);
        }
        return {
            address: tWlt.toFriendly(),
            balance: foubndBalance,
            lastDayTxOutCount: cLastDayOutTxs
        };
    });
}
// async function BI(res: ValidatorResult) {
//     let doc = {
//         address: GetName(res.snmWallet),
//         stage: "none",
//         amount: new Number(0),
//         percentage: new Number(0)
//     };
//     doc.stage = "validation";
//     doc.amount = res.validationStaked;
//     //await sendToKibana(doc);
//     doc.stage = "election";
//     doc.amount = res.electionStaked;
//     //await sendToKibana(doc);
//     doc.stage = "frozen";
//     doc.amount = res.frozened;
//     //await sendToKibana(doc);
//     doc.stage = "notClaimed";
//     doc.amount = res.notClaimed;
//     //await sendToKibana(doc);
//     doc.stage = "total";
//     doc.amount = res.total;
//     //await sendToKibana(doc);
//     doc.stage = "wallet";
//     doc.amount = res.balance;
//     //await sendToKibana(doc);
//     doc.stage = "APY";
//     doc.amount = res.APY * 100;
//     //await sendToKibana(doc);
// }
function AlertOnSNM(res) {
    let prefix = "SNM Alert " + GetName(res.snmWallet, true);
    // if( res.notClaimed > 0 )
    //   SendAlert(prefix+" There are "+res.notClaimed+" in Elector");
    if (res.lastDayTxs < 1)
        SendAlert(prefix + " No out Txs to Elector in last day");
    if (res.balance > MIN_APR_FOR_COLLECTING)
        SendAlert(prefix + " Wallet has speare balance to use " + res.balance);
    if (res.APY < 5)
        SendAlert(prefix + "APY estimated is below 5%: " + res.APY);
}
function AlertOnTopUp(res) {
    let prefix = "TOPUP alert " + GetName(res.address, true);
    if (res.balance < MIN_TOPUP_BALANCE)
        SendAlert(prefix + " has low balance");
    else if (res.lastDayTxOutCount < 1)
        SendAlert(prefix + " no tx in last day");
    else if (res.lastDayTxOutCount > 6)
        SendAlert(prefix + " Suscpicious activity - too many txs per day");
}
class Results {
    constructor() {
        this.snms = [];
        this.topups = [];
    }
}
;
function DailyReport(result) {
    let report = `${new Date()}\n\n`;
    let bMorning = new Date().getHours() == 8; //UTC
    if (!bMorning) {
        return;
    }
    console.log("Sending DailyReport to TG");
    result.snms.forEach(r => {
        report += `${GetName(r.snmWallet, true)}\nTotal:${r.total}\nRewards:${r.balance}\n\n`;
    });
    report += "\n";
    result.topups.forEach(r => {
        report += `${GetName(r.address, true)}\nWallet balance:${r.balance}\n`;
    });
    SendAlert(report);
}
function MonitorActivity() {
    return __awaiter(this, void 0, void 0, function* () {
        const gwendpoint = "http://v2-mainnet";
        //console.log(">>>>>>>: ",gwendpoint);
        let client = new ton_1.TonClient({
            endpoint: gwendpoint,
            apiKey: "orbs-gw5959"
        });
        let results = new Results();
        var name = "Geralt";
        console.log(`Testing ${config_json_1.default.SNMWallets.length} snm wallets`);
        let promisesSNM = [];
        for (const w of config_json_1.default.SNMWallets) {
            console.log("SNM:", w);
            promisesSNM.push(ValidatorsBalance(client, ton_1.Address.parse(w)));
        }
        const resSNMArr = yield Promise.all(promisesSNM);
        resSNMArr.forEach(res => {
            AlertOnSNM(res);
            results.snms.push(res);
        });
        console.log(`Testing ${config_json_1.default.V3Wallets.length} Topup wallets`);
        let promisesTUP = [];
        for (const w of config_json_1.default.V3Wallets) {
            console.log("Topup:", w);
            promisesTUP.push(CheckTopUpWallets(client, ton_1.Address.parse(w)));
        }
        const resTPArr = yield Promise.all(promisesTUP);
        resTPArr.forEach(res => {
            AlertOnTopUp(res);
            results.topups.push(res);
        });
        DailyReport(results);
        console.log("finished"); //,JSON.stringify(results));
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Scan start...", new Date());
        yield MonitorActivity();
    });
}
main();
