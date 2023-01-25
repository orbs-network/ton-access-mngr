
import { Cell, Address, fromNano , Slice , TonClient4,TonClient, parseDict,parseValidatorSet, ADNLAddress, TonTransaction} from "ton";
import BN from 'bn.js';
import { Sha256 } from "@aws-crypto/sha256-js";
import { getHttpEndpoint } from "@orbs-network/ton-access"
import { ElectorContract } from "ton-contracts"
import  AllConfig from "./config.json"
import ws from "ws";
import axios from "axios";


const MIN_STAKE=300000;
const MIN_TOPUP_BALANCE = 100;
const MIN_APR_FOR_COLLECTING = 50000;
const DEBUG = false;
type ParsedTx = {
    value:number;
    in_out:string;
    source:string|undefined;
    destination:string|undefined;
    time:Date
}

async function sendToKibana(oo: any)
{   
    //console.log("kibana->",oo);return;
    await axios.get('http://logs.orbs.network:3001/putes/ton-validators', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    data: JSON.stringify(oo),
    
    })

}

function SendAlert(alert:string)
{
    console.log("Alert: ",alert);
    let url = "https://api.telegram.org/bot5673887102:AAEJqQ7TxGXDYtnVvSn2NnQ2U9Mb2EmNNEQ/sendMessage?chat_id=-838471030&parse_mode=markdown&text="
    axios.get(url+encodeURI(alert));
}

function GetName(addr:string,forTG:boolean = false):string{
    //@ts-ignore
    let name = AllConfig.Names[addr];
    if (!name)
        name="";
    if( forTG)
        return "<"+name+">: ["+addr+"](https://tonscan.org/address/+"+addr+")";
    else
        return "<"+name+">: "+addr;
    
}
async function GetTxSafe(client:TonClient,addr:Address,limit = 20):Promise<TonTransaction[]>
{
    
    try{
        if( limit == 0)
         return [];
        return  await client.getTransactions(addr,{limit:limit});
    }catch(e)
    {
        //console.log("GetTX failed - curr limit:",limit);
        return await GetTxSafe(client,addr,limit-1);
    }
}
async function GetWalletTxs(addr:Address,client:TonClient) : Promise<ParsedTx[]>
{
    let orders :ParsedTx[] = [];
    let txs = await GetTxSafe(client,addr);
    
    
    txs.forEach((tx) => {
        
        let outMsg = tx.inMessage&& tx.outMessages.length > 0;
        let inMsg = tx.inMessage && !outMsg;
        //console.log(tx);
        if( tx.inMessage)
          orders.push({
            value:bnNanoTONsToTons(inMsg?tx.inMessage.value:outMsg?tx.outMessages[0].value:new BN(0)),
            in_out:inMsg?"in":outMsg?"out":"none",
            source:inMsg?tx.inMessage.source?.toFriendly():outMsg?tx.outMessages[0].source?.toFriendly():"",
            destination:inMsg?tx.inMessage.destination?.toFriendly():outMsg?tx.outMessages[0].destination?.toFriendly():"",
            time:new Date(tx.time * 1000)
          })
        
    });
    return orders;
}

type ValidatorResult = {
    snmWallet:string;
    balance:Number;
    notClaimed:Number;
    frozened:Number;
    validationStaked:Number;
    electionStaked:Number;
    total:Number;
    lastDayTxs:Number;
    APY:number;

};

async function ValidatorsBalance(client:TonClient, snmAddr:Address) : Promise<ValidatorResult>
{
    let electorContract = new ElectorContract(client);
	let elEnt = await electorContract.getElectionEntities()
    let ents = elEnt.entities;
    let pastEl = await electorContract.getPastElections();
    let vset = await GetCurrentValidators(client);
    
  
//Try to find if already in elections
    let found = false;
    let foundElectStake = 0;
    let foundEnt = ents.find(ent => ent.address.equals(snmAddr));
    if( foundEnt)
    {
       
       foundElectStake = bnNanoTONsToTons(foundEnt.stake);
    }  

 
 //Check if in Validator active set   
    
    let stakeinValidation = vset?.get(snmAddr.toFriendly());
    let foundValidationStaked =  0;
    if( stakeinValidation){
        foundValidationStaked =  bnNanoTONsToTons( stakeinValidation)
    }
   
 //look for frozen       
 
    let index = 0;
    let electId = vset?.get("vid")?.toNumber();
    let foundFrozenStake = 0;
    //find the prev one and ignore the one in validation now
    let foundPastEl = pastEl.find(el=>el.id != electId);
    
    if( foundPastEl )
    {
        let frozen = foundPastEl.frozen;
        let entFound = [...frozen.values()].find(ent=>ent.address.equals(snmAddr));
        if( entFound )
            foundFrozenStake = bnNanoTONsToTons(entFound.stake);
    }
    
      
//Wallet balnce - APR
    let foundBalance = bnNanoTONsToTons( await client.getBalance(snmAddr));
    
    
//Check for unclaimed
    let foundStakeNotClaimed = bnNanoTONsToTons( await electorContract.getReturnedStake(snmAddr));
    let total = foundStakeNotClaimed+foundBalance+foundElectStake+foundFrozenStake+foundValidationStaked;

    let res = await GetWalletTxs(snmAddr,client);
    let outTxs = 0;
    let lastStaked:number = 0;
    let lastReturned:number = 0;
    res.forEach(async r =>
        {
            if(   r.in_out == "out" &&
                    r.value > MIN_STAKE && 
                    r.destination && 
                    electorContract.address.equals(Address.parse(r.destination)) && 
                    GetHoursSince(r.time) < 24
            )
            {
                outTxs++;
                lastStaked = lastStaked?lastStaked:r.value;
            }
            if( r.in_out == "in" &&
                r.value > MIN_STAKE &&
                r.source &&
                electorContract.address.equals(Address.parse(r.source)) && 
                GetHoursSince(r.time) < 24
            )
            {
                lastReturned = r.value;
            }
            
            
            
             
        }
    )
   

    lastStaked--; //reduce the fee sent
    let reward = lastReturned-(lastStaked)
    let estimateAPY = 100 * reward * 365 * 24 / (Math.pow(2,16) / 3600) / 2 /(lastStaked)
    //console.log(estimateAPY);

    
    if(DEBUG)
    {
        console.log("==========    Checking SNM Wallet:",GetName(snmAddr.toFriendly()));
        console.log("found balance in wallet:",foundBalance);
        console.log("Found stake in election (pre)",foundElectStake);
        console.log("Found In Currenct Validation:",foundValidationStaked);
        console.log("found stake frozen:",foundFrozenStake);
        console.log("found returnedStake:",foundStakeNotClaimed);
        console.log("Last APY:",estimateAPY);
        
        console.log("Total:",total);
    }    
    
    

    return {
        snmWallet:snmAddr.toFriendly(),
        notClaimed:foundStakeNotClaimed,
        balance:foundBalance,
        validationStaked:foundValidationStaked,
        frozened:foundFrozenStake,
        electionStaked:foundElectStake,
        total:total,
        lastDayTxs:outTxs,
        APY:estimateAPY
    }
}

function configParseValidatorSet(slice:Slice|undefined) {
    if (!slice) {
        return null;
    }
    return parseValidatorSet(slice);
}

function bnNanoTONsToTons(bn: BN): number {
    return bn.div(new BN(Math.pow(10, 9))).toNumber()
}
async function GetCurrentValidators(client:TonClient) { //Current Validators
    
    //let configs = await client.services.configs.getConfigs(); //getConfigReliable();
    let configs = await client.services.configs.getConfigsRaw();
    //let s = configParseValidatorSet(configs.get('32'));
    let set1 = configParseValidatorSet(configs.get('34'));//this is the active set
   
    let elector = new ElectorContract(client);
    let elections = await elector.getPastElections();
    let ex = elections.find(v => v.id === set1!.timeSince)!;
    if( !set1?.list || !ex) return

    let lst = set1?.list;
    let all = new Map<String,BN>();
    [...lst.values()].map(
	    (entity) => {if( ex) 
            {
                let frozen = ex.frozen;
                let entry = frozen.get(new BN(entity.publicKey, 'hex').toString());
                if( entry )
                    all.set(entry.address.toFriendly(),entry.stake);

            }
        }
    );
    all.set("vid",new BN(set1.timeSince));
    
    return all;
    
}


function GetHoursSince(date:Date):Number
{
    let diff =  Math.floor( ( Date.now()- date.getTime()) / (1000*60*60));
    return diff;
}
type TopUpResult = {
    address:string;
    balance:Number;
    lastDayTxOutCount:Number;
};
async function CheckTopUpWallets(client:TonClient,tWlt:Address): Promise<TopUpResult>
{
   let foubndBalance = bnNanoTONsToTons(await client.getBalance(tWlt));
   
   let txs = await GetWalletTxs(tWlt,client);
   let cLastDayOutTxs = 0;
   txs.forEach(tx=> 
        {
            if( tx.in_out === "out" && GetHoursSince(tx.time) < 24 )
                cLastDayOutTxs++
        }
    )
    if( DEBUG)
    {
        console.log("=== checking TopUp Wallet:",GetName(tWlt.toFriendly()));
        console.log("Found balance: ",foubndBalance);
        console.log("Found out Txs in last day:",cLastDayOutTxs);
    }
    return {
        address:tWlt.toFriendly(),
        balance:foubndBalance,
        lastDayTxOutCount:cLastDayOutTxs

   }
   

}

async function BI(res:ValidatorResult)
{


    let doc = {
        address:GetName(res.snmWallet),
        stage:"none",
        amount:new Number(0),
        percentage:new Number(0)
        
    };
    doc.stage = "validation";
    doc.amount = res.validationStaked;
    await sendToKibana(doc);

    doc.stage = "election";
    doc.amount = res.electionStaked;
    await sendToKibana(doc);

    doc.stage = "frozen";
    doc.amount = res.frozened;
    await sendToKibana(doc);

    doc.stage = "notClaimed";
    doc.amount = res.notClaimed;
    await sendToKibana(doc);

    doc.stage = "total";
    doc.amount = res.total;
    await sendToKibana(doc);

    doc.stage = "wallet";
    doc.amount = res.balance;
    await sendToKibana(doc);

    doc.stage = "APY";
    doc.amount = res.APY * 100;
    
    await sendToKibana(doc);

}

function AlertOnSNM(res:ValidatorResult)
{
    let prefix = "SNM Alert "+GetName(res.snmWallet,true);
   // if( res.notClaimed > 0 )
   //   SendAlert(prefix+" There are "+res.notClaimed+" in Elector");
    if( res.lastDayTxs < 1)
      SendAlert(prefix+" No out Txs to Elector in last day");
    if( res.balance > MIN_APR_FOR_COLLECTING )
      SendAlert(prefix+" Wallet has speare balance to use "+res.balance);
    if( res.APY < 5 )
      SendAlert(prefix+"APY estimated is below 5%: "+res.APY);
}
function AlertOnTopUp(res:TopUpResult)
{
    let prefix = "TOPUP alert "+GetName(res.address,true);
    if( res.balance < MIN_TOPUP_BALANCE)
      SendAlert(prefix+" has low balance");
    else if( res.lastDayTxOutCount < 1 )
      SendAlert(prefix+" no tx in last day");
    else if( res.lastDayTxOutCount > 6 )
      SendAlert(prefix+" Suscpicious activity - too many txs per day");
}
class Results  {
    snms:ValidatorResult[] = [] ;
    topups:TopUpResult[] = [];
};

function DailyReport(result:Results)
{
    
    let report = `${new Date()}\n\n`;
    let bMorning  = new Date().getHours() == 8;//UTC
    if(!bMorning)
    {
        return;
    }
    console.log("Sending DailyReport to TG");
        
    result.snms.forEach(r=>
        {
            report+=`${GetName(r.snmWallet,true)}\nTotal:${r.total}\nRewards:${r.balance}\n\n`
        }
    )
    report+="\n"
    result.topups.forEach(r=>
        {
        report+=`${GetName(r.address,true)}\nWallet balance:${r.balance}\n`
        }
    )
        
    SendAlert(report);
    
    
}
async function MonitorActivity()
{
    const gwendpoint = await getHttpEndpoint();
    //console.log(">>>>>>>: ",gwendpoint);
    
    let client = new TonClient({
        endpoint:gwendpoint,
        apiKey:"orbs-gw5959"
    });

    
    
    let results = new Results();
    var name : string = "Geralt";

    console.log(`Testing ${AllConfig.SNMWallets.length} snm wallets`);
    
    let promisesSNM:Promise<ValidatorResult>[] = [];
    for (const w of AllConfig.SNMWallets )
     {
            console.log("SNM:",w);
            promisesSNM.push(ValidatorsBalance(client, Address.parse(w)));
     }
    const resSNMArr = await Promise.all(promisesSNM);
    
    resSNMArr.forEach(res=>{
            BI(res);
            AlertOnSNM(res);
            results.snms.push(res);
     })
    
    
    console.log(`Testing ${AllConfig.V3Wallets.length} Topup wallets`);
    let promisesTUP:Promise<TopUpResult>[] = [];
    for( const w of AllConfig.V3Wallets)
    {
        console.log("Topup:",w);
        promisesTUP.push(CheckTopUpWallets(client,Address.parse(w)));
        
    }
    const resTPArr = await Promise.all(promisesTUP);
    resTPArr.forEach(res=>{
        AlertOnTopUp(res);
        results.topups.push(res);
    })
    DailyReport(results);
    console.log("finished");//,JSON.stringify(results));
   
}



async function main()
{
   console.log("Scan start...",new Date());
   await MonitorActivity();
   
}

main();





