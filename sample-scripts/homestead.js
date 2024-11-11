const express = require('express');
const { SorobanRpc, xdr, Address, nativeToScVal, scValToNative, TransactionBuilder, Contract, StrKey, Keypair, Networks } = require('@stellar/stellar-sdk');
const { execSync } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3001;
const RPC_URL = process.env.RPC_URL;
const CONTRACT_ID = 'CDL74RF5BLYR2YBLCCI7F5FB6TPSCLKEJUBSD2RSVWZ4YHF3VMFAIGWA';
const rpc = new SorobanRpc.Server(RPC_URL);

// Specify farmers secret keys here.
const secrets  = [
    'SECRET...KEY'
];

// Set to false to submit via SDK (e.g. if Stellar CLI is not available).
const useCli = true;

const signers = secrets.reduce((acc, secret) => {
    const keypair = Keypair.fromSecret(secret);
    acc[keypair.publicKey()] = { secret };
    return acc;
}, {});

let data = {
    hash: null,
    block: 0
};

function constractError(log) {
    const errStr = {
        1: 'AlreadyDiscovered', 2: 'HomesteadNotFound', 3: 'PailAmountTooLow', 4: 'AlreadyHasPail',
        5: 'FarmIsPaused', 6: 'HashIsInvalid', 7: 'BlockNotFound', 8: 'HarvestNotReady',
        9: 'KaleNotFound', 10: 'PailNotFound', 11: 'ZeroCountTooLow', 12: 'AssetAdminMismatch',
        13: 'FarmIsNotPaused'
    };
    const match = log.toString().match(/Error\(Contract, #(\d+)\)/);
    if (match) {
        return errStr[parseInt(match[1], 10)];
    }
    return null;
}

async function harvestAll(block) {
    for (const key in signers) {
        try {
            await execute('harvest', { farmer: key, block });
            console.log(`Harvest successful for ${key} on block ${block}`);
        } catch(err) {
            const error = constractError(err);
            console.error(`Harvest failed for ${key} on block ${block} -> ${error}`);
        }
    }
}

async function getData() {
    const result = {};
    try {
        const { val } = await rpc.getContractData(
            CONTRACT_ID,
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
        console.error("Error:", error);
    }   
    return result;
}

async function fetchContent(delay) {
    while (true) {
        const result = await getData();
        if (!result?.block || !result?.hash) {
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
        }
        const changed = result.block !== data.block || result.hash !== data.hash;
        if (changed) {
            data = result;
            const coreDataLedgerKey = xdr.LedgerKey.contractData(
                new xdr.LedgerKeyContractData({
                    contract: new Address(CONTRACT_ID).toScAddress(),
                    key: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Block"),
                        nativeToScVal(Number(data.block - 1), { type: "u32" })]),
                    durability: xdr.ContractDataDurability.temporary(),
                })
            );
            delete data.details;
            const blockData = await rpc.getLedgerEntries(coreDataLedgerKey);
            const entry = blockData.entries?.[0];
            if (entry) {
                const blockData = scValToNative(entry.val?._value.val());
                data.details = {
                    pow_zeros: Number(blockData.pow_zeros),
                    reclaimed: Number(blockData.reclaimed),
                    staked: Number(blockData.staked),
                    timestamp: BigInt(blockData.timestamp)
                };
            }
            await harvestAll(data.block - 1);
            console.log(`Updated: ${JSON.stringify(data,
                (_key, value) => typeof value === 'bigint' ? value.toString() : value)}`);
        }

        if (BigInt(Math.floor(Date.now() / 1000)) - (data.details?.timestamp || 0) > 60 * 5) {
            for (const publicKey in signers) {
                delete signers[publicKey].plant;
            }
        }
        await new Promise(resolve => setTimeout(resolve, delay));
    }
}

async function execute(method, data) {
    if (!StrKey.isValidEd25519SecretSeed(signers[data.farmer].secret)) {
        console.error("Invalid farmer:", data.farmer);
        return 'Invalid farmer';
    }
    let args;
    const contract = new Contract(CONTRACT_ID);
    switch (method) {
        case 'plant':
            args = useCli
                ? `PATH=$PATH:/root/.cargo/bin stellar contract invoke --id ${CONTRACT_ID} \
                    --source ${signers[data.farmer].secret} --network MAINNET -- plant --farmer ${data.farmer} --amount ${data.amount}`
                : contract.call('plant', new Address(data.farmer).toScVal(), nativeToScVal(data.amount, { type: 'i128' }));
            break;
        case 'work':
            args = useCli
                ? `PATH=$PATH:/root/.cargo/bin stellar contract invoke --id ${CONTRACT_ID} \
                    --source ${signers[data.farmer].secret} --network MAINNET -- work --farmer ${data.farmer} --hash ${data.hash} --nonce ${data.nonce}`
                : contract.call('work', new Address(data.farmer).toScVal(), xdr.ScVal.scvBytes(Buffer.from(data.hash, 'hex')), nativeToScVal(data.nonce, { type: 'u128' }));
            break;
        case 'harvest':
            args = useCli
                ? `PATH=$PATH:/root/.cargo/bin stellar contract invoke --id ${CONTRACT_ID} \
                    --source ${signers[data.farmer].secret} --network MAINNET -- harvest --farmer ${data.farmer} --index ${data.block}`
                : contract.call('harvest', new Address(data.farmer).toScVal(), nativeToScVal(data.block, { type: 'u32' }))
            break;
    }

    if (useCli) {
        const output = execSync(args, { encoding: 'utf8', stdio: 'pipe' });
        return { output };
    } else {
        const account = await rpc.getAccount(data.farmer);
        let transaction = new TransactionBuilder(account, { fee: '10000000', networkPassphrase: Networks.PUBLIC })
            .addOperation(args)
            .setTimeout(300)
            .build();
        transaction = await rpc.prepareTransaction(transaction);
        transaction.sign(Keypair.fromSecret(signers[data.farmer].secret));
        return await rpc.sendTransaction(transaction);
    }
}

app.get('/data', (_req, res) => {
    const convert = (obj) => {
        if (typeof obj === 'bigint') {
            return obj.toString();
        } else if (Array.isArray(obj)) {
            return obj.map(convert);
        } else if (obj && typeof obj === 'object') {
            return Object.fromEntries(
                Object.entries(obj).map(([key, value]) => [key, convert(value)])
            );
        }
        return obj;
    }
    res.json(convert(data));
});

app.get('/plant', async(req, res) => {
    const { farmer, amount } = req.query;
    try {
        const signer = signers[farmer];
        if (signer && (!signer.plant || signer.plant !== data.block)) {
            signer.plant = data.block;
            const result = await execute('plant', { farmer, amount });
            console.log(result)
            res.json({ result });
        }
    } catch (error) {
        console.error(error.message);
        res.status(500).send(error.message);
    }
});

app.get('/work', async(req, res) => {
    const { farmer, hash, nonce } = req.query;
    try {
        const result = await execute('work', { farmer, hash, nonce });
        console.log(result)
        res.json({ result }); 
    } catch (error) {
        console.error(error.message);
        res.status(500).send(error.message);
    }
});

app.get('/harvest', async(req, res) => {
    const { farmer, block } = req.query;
    try {
        const result = await execute('harvest', { farmer, block });
        res.json({ result }); 
    } catch (error) {
        console.error(error.message);
        res.status(500).send(error.message);
    }
});

app.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
    fetchContent(1000);
});
