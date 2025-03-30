/*!
 * This file is part of kale-miner.
 * Author: Fred Kyung-jin Rezeau <fred@litemint.com>
 */

const { scValToNative } = require('@stellar/stellar-sdk');
const { invoke, getError, getReturnValue, getPail, signers } = require('./contract');
const config = require(process.env.CONFIG || './config.json');

const retryInterval = 10 * 1000;

function parseRange(input) {
    if (/^\d+-\d+$/.test(input)) {
        return { range: input.split('-').map(Number) };
    } else if (/^-\d+$/.test(input)) {
        return { count: Number(input.slice(1)) };
    }
    return {};
}

class Harvester {
    static queue = [];
    static tractor = {
        lastFlush: 0,
        lastLogTime: 0,
        retries: {}
    };

    static add(farmer, block, time, retry) {
        retry = retry || config.harvester?.retryCount;
        if (!this.queue.some(entry => entry.farmer === farmer && entry.block === block)) {
            this.queue.push({ farmer, block, time, retry });
            this.queue.sort((a, b) => a.time - b.time);
        }
    }

    static async harvest(data) {
        if (data.tractor) {
            const { farmer, blocks } = data;
            const validBlocks = (
                await Promise.all(blocks.map(d => d).map(async block => {
                    const pail = await getPail(farmer, block);
                    return pail?.zeros && pail?.sequence ? block : null;
                }))
            ).filter(Boolean);
            if (validBlocks.length) {
                try {
                    const response = await invoke('tractor', { farmer, blocks: validBlocks, contract: data.tractor });
                    if (response.status !== 'SUCCESS') {
                        throw new Error(`tx Failed: ${response.hash}`);
                    }
                    const fee = Number(response.feeCharged || 0);
                    const raw = scValToNative(getReturnValue(response.resultMetaXdr)) || [];
                    const rewards = raw.map(r => Number(r) / 1e7);
                    const total = rewards.reduce((a, b) => a + b, 0);
                    const nonZeroRewards = rewards.filter(r => r > 0);
                    this.updateStats(farmer, {
                        fee, feeCount: 1, amount: total, harvestCount: nonZeroRewards.length,
                        minHarvest: Math.min(...nonZeroRewards), maxHarvest: Math.max(...nonZeroRewards),
                        lastAmount: nonZeroRewards.at(-1), lastBlock: validBlocks.at(-1)
                    });
                    console.log(`Farmer ${farmer} harvested blocks [${validBlocks.join(', ')}] for ${total} KALE`);
                    this.tractor.retries[farmer] = config.harvester?.retryCount || 0;
                } catch (err) {
                    const retry = this.tractor.retries[farmer] ?? (this.tractor.retries[farmer] = config.harvester?.retryCount ?? 0);
                    const error = getError(err);
                    console.error(`Farmer ${farmer} could not harvest blocks [${validBlocks.join(', ')}]: ${error}. Retry count: ${retry}.`);
                    if (retry > 0) {
                        this.tractor.retries[farmer] = retry - 1;
                        validBlocks.forEach((block) => {
                            this.add(farmer, block, 0);
                        });
                        this.tractor.lastFlush = Date.now() - ((config.harvester?.tractor?.frequency || 0) * 1000 - retryInterval);
                    } else {
                        this.testFail = false;
                    }
                }
            }
        } else {
            const { farmer, block, retry } = data;
            const status = await getPail(farmer, block);
            if (status?.zeros && status?.sequence) {
                try {
                    const response = await invoke('harvest', { farmer, block });
                    if (response.status !== 'SUCCESS') {
                        throw new Error(`tx Failed: ${response.hash}`);
                    }
                    const value = Number(scValToNative(getReturnValue(response.resultMetaXdr)) || 0);
                    const fee = Number(response.feeCharged || 0);
                    const amount = value / 1e7;
                    this.updateStats(farmer, {
                        fee, feeCount: 1, amount, harvestCount: 1, minHarvest: amount, maxHarvest: amount,
                        lastAmount: amount, lastBlock: block
                    });
                    console.log(`Farmer ${farmer} harvested block ${block} for ${amount} KALE`);
                } catch (err) {
                    const error = getError(err);
                    console.error(`Farmer ${farmer} could not harvest block ${block}: ${error}. Retry count: ${retry || 0}.`);
                    if (!isNaN(retry) && retry > 0) {
                        data.retry -= 1;
                        setTimeout(() => {
                            this.add(farmer, block, Date.now() + retryInterval, data.retry);
                        }, 10);
                    }
                }
            }
        }
    }

    static updateStats(farmer, stats) {
        const signer = signers[farmer];
        signer.stats.fees += stats.fee;
        signer.stats.feeCount += stats.feeCount;
        signer.stats.minFee = Math.min(signer.stats.minFee || Number.MAX_VALUE, stats.fee);
        signer.stats.maxFee = Math.max(signer.stats.maxFee || 0, stats.fee);
        signer.stats.amount += stats.amount;
        signer.stats.harvestCount += stats.harvestCount;
        signer.stats.minAmount = Math.min(signer.stats.minAmount || Number.MAX_VALUE, stats.minHarvest);
        signer.stats.maxAmount = Math.max(signer.stats.maxAmount || 0, stats.maxHarvest);
        signer.stats.lastAmount = stats.lastAmount;
        signer.stats.lastBlock = stats.lastBlock;
    }

    static async flush(force) {
        const tractor = config.harvester?.tractor;
        if (tractor?.contract) {
            const now = Date.now();
            const freq = (tractor.frequency || 0) * 1000;
            if (!force && now - this.tractor.lastFlush < freq) {
                if (now - this.tractor.lastLogTime >= 60000) {
                    console.log(`Tractor next harvest in ${new Date(freq - (now - this.tractor.lastFlush)).toISOString().substr(14, 5)} mins.`);
                    this.tractor.lastLogTime = now;
                }
                return;
            }
            this.tractor.lastFlush = now;
            const batch = this.queue.reduce((b, { farmer, block }) => {
                (b[farmer] ||= []).push(block);
                return b;
            }, {});
            this.queue.length = 0;
            for (const farmer in batch) {
                await this.harvest({ farmer, blocks: batch[farmer], tractor: tractor.contract });
            }
        } else {
            while (this.queue.length > 0) {
                const now = Date.now();
                const next = this.queue[0];
                if (next.time > now) {
                    await new Promise(resolve => setTimeout(resolve, next.time - now));
                }
                await this.harvest(this.queue.shift());
            }
        }
    }

    static run() {
        const process = async () => {
            const tractor = config.harvester?.tractor;
            if (tractor?.contract) {
                this.flush();
            } else {
                while (this.queue.length && this.queue[0].time <= Date.now()) {
                    await this.harvest(this.queue.shift());
                }
            }
            setTimeout(process, 1000);
        };
        process();
    }
}

module.exports = { Harvester, parseRange };