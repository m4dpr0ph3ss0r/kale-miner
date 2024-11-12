/*!
 * This file is part of kale-miner.
 * Author: Fred Kyung-jin Rezeau <fred@litemint.com>
 */

const express = require('express');
const { xdr, nativeToScVal } = require('@stellar/stellar-sdk');
const { spawn } = require('child_process');
const routes = require('./routes');
const config = require(process.env.CONFIG || './config.json');
const { signers, blockData, invoke, getError, getInstanceData, getTemporaryData, getPail } = require('./contract');
const app = express();
const PORT = process.env.PORT || 3002;
const pollInterval = 5 * 1000;

const FarmerStatus = Object.freeze({
    PLANTING: 1,
    WORKING: 2,
    IDLE: 4
});

async function plant(key, block) {
    try {
        if (signers[key].status !== FarmerStatus.PLANTING) {
            return;
        }
        const amount = signers[key].stake;
        await invoke('plant', { farmer: key, amount });
        console.log(`Farmer ${key} planted ${block} with ${Number(amount) / 10000000} KALE`);
        signers[key].status = FarmerStatus.WORKING;
        logStatus(key);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
    } catch(err) {
        const error = getError(err)
        if (error !== 'PailNotFound' && error !== 'AlreadyHasPail') {
            console.error(`Farmer ${key} could not plant ${block}: ${error}`);
        }
    }
}

async function harvest(key, block) {
    if (signers[key].harvested) {
        return;
    }
    signers[key].harvested = true;
    try {
        await invoke('harvest', { farmer: key, block });
        console.log(`Farmer ${key} harvested block ${block}`);
    } catch(err) {
        const error = getError(err);
        if (error !== 'PailNotFound') {
            console.error(`Farmer ${key} could not harvest block ${block}: ${error}`);
        }
    }
}

async function work(key, block, hash) {
    const {
        difficulty,
        nonce,
        gpu,
        maxThreads,
        batchSize,
        verbose,
        device,
        executable
    } = config.miner;

    if (signers[key].status !== FarmerStatus.WORKING) {
        return;
    }

    try {
        await mine(executable, block, hash, nonce, signers[key].difficulty || difficulty, key, maxThreads, batchSize, device, gpu, verbose);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
    } catch (error) {
        const errorCode = getError(error);
        console.error(`Farmer ${key} couldn not submit work for ${block}: ${errorCode}`);
        if (errorCode === 'PailNotFound') {
            signers[key].status = FarmerStatus.PLANTING;
            logStatus(key);
        }
    }
}

async function mine(minerExec, block, hash, nonce, difficulty, key, maxThreads, batchSize, device, gpu, verbose) {
    return new Promise((resolve, reject) => {
        const args = [
            block, hash, nonce, difficulty, key,
            '--max-threads', maxThreads,
            '--batch-size', batchSize,
            '--device', device
        ];
        if (gpu) args.push('--gpu');
        if (verbose) args.push('--verbose');

        console.log(`Farmer ${key} process started with command: ${args}\n====MINING JOB=====\n`);
        let output = '';
        const minerProc = spawn(minerExec, args);
        minerProc.stdout.on('data', (data) => {
            const lines = `${data}`.split('\n');
            lines.forEach((line) => {
                if (line.trim()) {
                    console.log(line);
                    output += line + '\n';
                }
            });
        });

        minerProc.stderr.on('data', (data) => {
            console.error(`${data}`);
        });

        minerProc.on('close', async (code) => {
            console.log(`====END MINING JOB=====\nFarmer ${key} process completed: code(${code})`);
            try {
                const result = output.match(/{[\s\S]*?}/);
                if (result) {
                    const json = JSON.parse(result[0]);
                    await invoke('work', { farmer: key, hash: json.hash, nonce: json.nonce });
                    console.log(`Farmer ${key} submitted work [${json.hash}, ${json.nonce}] for ${block}`);
                    signers[key].status = FarmerStatus.IDLE;
                    logStatus(key);
                    resolve();
                } else {
                    reject(new Error(`No result found`));
                }
            } catch (error) {
                reject(error);
            }
        });

        minerProc.on('error', (error) => {
            reject(error);
        });
    });
}

async function runFarm(interval) {
    let count = 0;
    while (true) {
        count += 1;
        const result = await getInstanceData();
        if (!result?.block || !result?.hash) {
            await new Promise(resolve => setTimeout(resolve, interval));
            continue;
        }
        const changed = result.block !== blockData.block;
        const elapsed = BigInt(Math.floor(Date.now() / 1000)) - BigInt(blockData.details?.timestamp || 0) > 60 * 5 + 30;
        if (changed || elapsed) {
            if (changed) {
                console.log(`New block detected ${result.block}`);
                blockData.block = result.block;
                delete blockData.hash;
                const tmpData = await getTemporaryData(xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Block"),
                    nativeToScVal(Number(blockData.block), { type: "u32" })]));
                if (tmpData) {
                    blockData.hash = Buffer.from(tmpData.entropy).toString('base64');
                    blockData.details = {
                        pow_zeros: Number(tmpData.pow_zeros),
                        reclaimed: Number(tmpData.reclaimed),
                        staked: Number(tmpData.staked),
                        timestamp: BigInt(tmpData.timestamp)
                    };
                    console.log(`${JSON.stringify(blockData,
                        (_key, value) => typeof value === 'bigint' ? value.toString() : value)}`);
                }
            }
            for (const key in signers) {
                console.log(`Farmer ${key} is READY`);
                signers[key].status = FarmerStatus.PLANTING;
                signers[key].harvested = false;
            }
        }

        for (const key in signers) {
            await plant(key, blockData.block);
            if (elapsed) {
                break;
            }
            await updateStatus(key, blockData.block);
            await work(key, blockData.block, blockData.hash);
            await updateStatus(key, blockData.block);
        }
        if (elapsed) {
            continue;
        }
        for (const key in signers) {
            await harvest(key, blockData.block - 1);
        }
        if (count % 10 === 0) {
            console.log(`Current block is ${blockData.block}`);
        }
        await new Promise(resolve => setTimeout(resolve, interval));
    }
}

async function updateStatus(key, block) {
    try {
        if (signers[key].status !== FarmerStatus.IDLE) {
            const status = await getPail(key, block);
            if (!!status?.[1] && signers[key].status !== FarmerStatus.IDLE) {
                signers[key].status = FarmerStatus.IDLE;
                logStatus(key);
            } else if (!!status?.[0] && signers[key].status !== FarmerStatus.WORKING) {
                signers[key].status = FarmerStatus.WORKING;
                logStatus(key);
            }
        }
    } catch(err) {
        console.error(`Farmer ${key} status check failure ${block}: ${getError(err)}`);
    }
}

function logStatus(key) {
    const labels = {
        [FarmerStatus.PLANTING]: 'PLANTING',
        [FarmerStatus.WORKING]: 'WORKING',
        [FarmerStatus.IDLE]: 'DONE'
    };
    console.log(`Farmer ${key} is ${labels[signers[key].status]}`);
}

app.use('/', routes);

app.listen(PORT, () => {
    console.log(`Homestead server running on ${PORT}`);
    runFarm(pollInterval);
});
