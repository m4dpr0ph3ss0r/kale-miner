/*!
 * This file is part of kale-miner.
 * Author: Fred Kyung-jin Rezeau <fred@litemint.com>
 */

const { SorobanRpc, Horizon, xdr, Address, Operation, Asset, Contract, Networks, TransactionBuilder, StrKey, Keypair, nativeToScVal, scValToNative } = require('@stellar/stellar-sdk');
const config = require(process.env.CONFIG || './config.json');
const rpc = new SorobanRpc.Server(process.env.RPC_URL || config.stellar?.rpc);
const horizon = new Horizon.Server(config.stellar?.horizon || 'https://horizon.stellar.org', { allowHttp: true });
const contractId = config.stellar?.contract;
const fees = config.stellar?.fees || 10000000;

const signers = config.farmers.reduce((acc, farmer) => {
    const keypair = Keypair.fromSecret(farmer.secret);
    const publicKey = keypair.publicKey();
    acc[publicKey] = {
        secret: farmer.secret,
        stake: farmer.stake || 0,
        difficulty: farmer.difficulty || 6,
        minWorkTime: farmer.minWorkTime || 0
    };
    return acc;
}, {});

const blockData = {
    hash: null,
    block: 0
};

const balances = {}

const contractErrors = Object.freeze({
    1: 'AlreadyDiscovered',
    2: 'HomesteadNotFound',
    3: 'PlantAmountTooLow',
    4: 'AlreadyHasPail',
    5: 'FarmIsPaused',
    6: 'HashIsInvalid',
    7: 'BlockNotFound',
    8: 'HarvestNotReady',
    9: 'WorkNotFound',
    10: 'PailNotFound',
    11: 'ZeroCountTooLow',
    12: 'AssetAdminMismatch',
    13: 'FarmIsNotPaused',
    14: 'WorkNotReady'
});

function getError(error) {
    function stringify(value) {
        return typeof value === 'object' && value !== null
            ? JSON.stringify(value) : (value || '');
    }
    const match = error.toString().match(/Error\(Contract, #(\d+)\)/);
    if (match) {
        return contractErrors[parseInt(match[1], 10)];
    }
    return stringify(error) || '';
}

async function getInstanceData() {
    const result = {};
    try {
        const { val } = await rpc.getContractData(
            contractId,
            xdr.ScVal.scvLedgerKeyContractInstance()
        );
        val.contractData()
            .val()
            .instance()
            .storage()
            ?.forEach((entry) => {
                switch(scValToNative(entry.key())[0]) {
                    case 'FarmIndex':
                        result.block = Number(scValToNative(entry.val()));
                        break;
                    case 'FarmEntropy':
                        result.hash = Buffer.from(scValToNative(entry.val())).toString('base64');
                        break;
                }
            });
    } catch (error) {
        console.error(error);
    }   
    return result;
}

async function getTemporaryData(key) {
    try {
        const data = xdr.LedgerKey.contractData(
            new xdr.LedgerKeyContractData({
                contract: new Address(contractId).toScAddress(),
                key,
                durability: xdr.ContractDataDurability.temporary(),
            })
        );
        const blockData = await rpc.getLedgerEntries(data);
        const entry = blockData.entries?.[0];
        if (entry) {
            return scValToNative(entry.val?._value.val());
        }
    } catch (error) {
        console.error(error);
    }
}

async function getPail(address, block) {
    const data = await getTemporaryData(xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Pail"),
        new Address(address).toScVal(),
        nativeToScVal(Number(block), { type: "u32" })]));
    return data;
}

async function setupAsset(farmer) {
    const issuer = config.stellar?.assetIssuer;
    const code = config.stellar?.assetCode;
    if (code?.length && StrKey.isValidEd25519PublicKey(issuer)) {
        const account = await horizon.loadAccount(farmer);
        if (!account.balances.some(balance => 
            balance.asset_code === code && balance.asset_issuer === issuer
        )) {
            const transaction = new TransactionBuilder(account, { fee: fees.toString(), networkPassphrase: config.stellar?.networkPassphrase || Networks.PUBLIC })
                .addOperation(Operation.changeTrust({
                    asset: new Asset(code, issuer)
                }))
                .setTimeout(300)
                .build();
            transaction.sign(Keypair.fromSecret(signers[farmer].secret));
            const response = await getResponse(await rpc.sendTransaction(transaction));
            if (response.status !== 'SUCCESS') {
                throw new Error(`tx Failed: ${response.hash}`);
            }
            console.log(`Trustline set for ${farmer} to ${code}:${issuer}`);
        }
        const native = account.balances.find(balance => balance.asset_type === 'native')?.balance || '0';
        const asset = account.balances.find(balance => balance.asset_code === code && balance.asset_issuer === issuer);
        balances[farmer] = { XLM: native, [code]: asset?.balance || '0' };
        console.log(`Farmer ${farmer} balances: ${asset?.balance || 0} ${code} | ${native} XLM`);
    }
}

async function getResponse(response, launchTube) {
    const txId = response.hash;
    if (!launchTube) {
        while (response.status === "PENDING" || response.status === "NOT_FOUND") {
            await new Promise(resolve => setTimeout(resolve, 2000));
            response = await rpc.getTransaction(txId);
        }
    }
    if (config.stellar?.debug) {
        console.log(response);
    }
    return response;
}

async function invoke(method, data) {
    if (!StrKey.isValidEd25519SecretSeed(signers[data.farmer].secret)) {
        console.error("Unauthorized:", data.farmer);
        return null;
    }

    let args;
    const contract = new Contract(contractId);
    switch (method) {
        case 'plant':
            args = contract.call('plant', new Address(data.farmer).toScVal(),
                nativeToScVal(data.amount, { type: 'i128' }));
            break;
        case 'work':
            args = contract.call('work', new Address(data.farmer).toScVal(), xdr.ScVal.scvBytes(Buffer.from(data.hash, 'hex')),
                nativeToScVal(data.nonce, { type: 'u64' }));
            break;
        case 'harvest':
            await setupAsset(data.farmer);
            args = contract.call('harvest', new Address(data.farmer).toScVal(),
                nativeToScVal(data.block, { type: 'u32' }))
            break;
    }

    const account = await rpc.getAccount(data.farmer);
    let transaction = new TransactionBuilder(account, { fee: fees.toString(), networkPassphrase: config.stellar?.networkPassphrase || Networks.PUBLIC })
        .addOperation(args)
        .setTimeout(300)
        .build();
    transaction = await rpc.prepareTransaction(transaction);
    transaction.sign(Keypair.fromSecret(signers[data.farmer].secret));

    if (LaunchTube.isValid()) {
        return await getResponse(await LaunchTube.send(transaction.toEnvelope().toXDR('base64'), fees), true);
    } else {
        return await getResponse(await rpc.sendTransaction(transaction));
    }
}

class LaunchTube {
    static isValid() {
        const jwt = /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/;
        return config.stellar?.launchtube?.url
            && jwt.test(config.stellar?.launchtube?.token)
            && config.stellar.launchtube.token.length > 30;
    }

    static async send(xdr, fee) {
        const data = new FormData();
        data.append('xdr', xdr);
        data.append('fee', fee.toString());
        data.append('sim', false);
        const res = await fetch(config.stellar.launchtube.url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.stellar.launchtube.token}`,
            },
            body: data
        });
        if (res.ok) {
            return await res.json();
        } else {
            const errorText = await res.text();
            console.error(`Launchtube: Error ${res.status}:`, errorText);
            throw new Error(`Launchtube: ${errorText}`);
        }
    }
}

module.exports = { getInstanceData, getTemporaryData, getPail, getError, invoke, LaunchTube, rpc, horizon, contractId, contractErrors, signers, blockData, balances };