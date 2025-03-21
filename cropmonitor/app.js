/*!
 * This file is part of kale-miner.
 * Author: Fred Kyung-jin Rezeau <fred@litemint.com>
 */

const blessed = require('blessed');
const axios = require('axios');
const contrib = require('blessed-contrib');
const config = require(process.env.CONFIG || '../homestead/config.json');
const PORT = process.env.PORT || 3002;

const cache = {};

const hashrateUnits = ['H/s', 'KH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s', 'EH/s'];
const hashRateInterval = 5000;
const hashRateCount = 7;
const hashrates = Array.from({ length: hashRateCount }, (_, i) => ({
    hashRate: 0, time: Date.now() - (hashRateCount - i) * hashRateInterval
}));

const screen = blessed.screen({
    smartCSR: true,
    autoPadding: true,
    title: 'KALE CROP MONITOR'
});

const harvestTable = blessed.listtable({
    border: { type: 'line' },
    align: 'left',
    tags: true,
    keys: false,
    mouse: false,
    interactive: false,
    noCellBorders: true,
    style: {
        header: { fg: 'green', bold: true },
        cell: { fg: 'white' }
    }
});

const blockTable = blessed.listtable({
    border: { type: 'line' },
    align: 'left',
    tags: true,
    keys: false,
    mouse: false,
    interactive: false,
    noCellBorders: true,
    style: {
        header: { fg: 'magenta', bold: true },
        cell: { fg: 'white' }
    }
});

const systemTable = blessed.listtable({
    border: { type: 'line' },
    align: 'left',
    tags: true,
    keys: false,
    mouse: false,
    interactive: false,
    noCellBorders: false,
    style: {
        header: { fg: 'gray', bold: true },
        cell: { fg: 'white' }
    }
});

const farmersTable = blessed.listtable({
    border: { type: 'line' },
    align: 'left',
    tags: true,
    keys: false,
    mouse: false,
    interactive: false,
    noCellBorders: true,
    style: {
        header: { fg: 'blue', bold: true },
        cell: { fg: 'white' }
    }
});

const logBox = blessed.log({
    border: { type: 'line' },
    label: 'Activity Log',
    tags: true,
    scrollable: true,
    keys: true,
    vi: true,
    mouse: true,
    style: { fg: 'yellow' }
});

const statusBox = blessed.box({
    border: { type: 'line', fg: 'cyan' },
    align: 'center',
    tags: true,
    scrollable: false,
    keys: false,
    mouse: false,
    style: { fg: 'cyan' }
});

const tipBox = blessed.box({
    border: { type: 'line', fg: 'black' },
    align: 'right',
    tags: true,
    scrollable: false,
    keys: false,
    mouse: false,
    style: { fg: 'gray' }
});

const graphBox = contrib.line({
    border: { type: 'line', fg: 'cyan' },
    showLegend: true,
    minY: 0,
    xPadding: 5,
    padding: { left: 1, right: 1, top: 1 },
    style: {
        line: 'magenta',
        text: 'white',
        baseline: 'black',
        border: { fg: 'white' },
        label: { fg: 'cyan', bold: true }
    }
});

function recalcLayout() {
    const layouts = [
        { element: blockTable, props: { top: 1, left: '50%+1', width: '50%-3', height: 4 } },
        { element: harvestTable, props: { top: 1, left: 1, width: '50%-1', height: 4 } },
        { element: systemTable, props: { top: 5, left: 1, width: '100%-4', height: 4 } },
        { element: farmersTable, props: { top: 9, left: 1, width: '100%-4', height: '30%' } },
        { element: logBox, props: { bottom: 4, left: 1, width: '100%-4', height: 7 } },
        { element: statusBox, props: { bottom: 1, left: 1, width: '70%-1', height: 3 } },
        { element: tipBox, props: { bottom: 1, left: '70%+1', width: '30%-3', height: 3 } },
        { element: graphBox, props: { bottom: 11, left: 1, width: '100%-4', height: 12 } }
    ];
    layouts.forEach(({ element, props }) => {
        Object.assign(element, props);
    });
    screen.render();
}

let farmerDetailsMode = false;

screen.on('resize', () => {
    recalcLayout();
});
screen.key(['escape', 'q', 'C-c'], () => process.exit(0));
screen.key(['f2'], () => {
    farmerDetailsMode = !farmerDetailsMode;
    updateData(true);
});

const log = new Set();
const pad = str => ` ${str}`;
const formatSessionTime = (time) => {
    const elapsed = Date.now() - time;
    return `${Math.floor(elapsed / (1000 * 60 * 60 * 24))}d ${Math.floor(elapsed / (1000 * 60 * 60)) % 24}h ${Math.floor(elapsed / (1000 * 60)) % 60}m ${Math.floor(elapsed / 1000) % 60}s`;
};

function renderFarmersTable(farmers) {
    const data = farmerDetailsMode ? [
        [pad('Farmer'), pad('Native Balance'), pad('Harvest (Min/Max/Avg)'), pad('Fee (Min/Max/Avg)'), pad('Gap (Min/Max/Avg)')],
    ] : [
        [pad('Farmer'), pad('Balance'), pad('Status'), pad('Block/Stake (Last)'), pad('Block/Harvest (Last)'), pad('Gap/Zeros'), pad('Total Harvest'), pad('Total Fee')],
    ];
    farmers?.forEach(farmer => {
        data.push(!farmerDetailsMode ? [
            pad(String(farmer.address)),
            pad(String(farmer.balance)),
            pad(String(farmer.status)),
            pad(String(farmer.stake)),
            pad(String(farmer.harvest)),
            pad(String(farmer.gapzeros)),
            pad(String(farmer.total)),
            pad(String(farmer.fees))
        ] :
        [
            pad(String(farmer.address)),
            pad(String(farmer.nativeBalance)),
            pad(String(farmer.harvestStats)),
            pad(String(farmer.feeStats)),
            pad(String(farmer.gapStats))
        ]);
    });
    farmersTable.setData(data);
}

function renderBlockTable(block) {
    const data = [
        [pad('Current Block'), pad('Time'), pad('Stake')],

    ];
    if (block) {
        data.push([
            pad(String(block.index)),
            pad(String(`${Math.floor((Date.now() - block.time) / 1000)}s ago`)),
            pad(String(block.staked))

        ]);
    }
    blockTable.setData(data);
}

function renderHarvestTable(totals) {
    const data = [
        [pad('Session Duration'), pad('Session Harvest'), pad('Session Fee')],
    ];
    if (totals) {
        data.push([
            ` ${formatSessionTime(totals.time)}`,
            ` ${totals.harvest.toFixed(3)} KALE`,
            ` ${(totals.fees / 10000000).toFixed(3)} XLM`
        ]);
    }
    harvestTable.setData(data);
}

function renderSystemTable(system) {
    const data = [
        [pad('GPU'), pad('Hashrate'), pad('KALE/min'), pad(system?.launchTube ? 'LaunchTube Credits' : 'LaunchTube')],
    ];
    if (system) {
        data.push([
            pad(String(system.gpu ?? '-').toUpperCase()),
            pad(String(system.hashrate || '-')),
            pad(String(system.earnRate || '-')),
            pad(system?.launchTube === false ? 'FALSE' : `${system?.launchTube && system.credits ? String(Number(system.credits).toFixed(3) || '-') : '-'} ${system?.launchTube && system.credits ? 'XLM' : ''}`)
        ])
    }
    systemTable.setData(data);
}

function renderGraph() {
    if (!(config.monitor?.showGraph ?? true)) {
        return;
    }

    const modeUnit = Object.entries(hashrates.reduce((acc, { unit }) => {
        if (unit) acc[unit] = (acc[unit] || 0) + 1;
        return acc;
    }, {})).reduce((a, [unit, count]) => count > a.count ? { unit, count }
        : a, { unit: hashrateUnits[0], count: 0 }).unit || hashrateUnits[0];

    const factor = Math.pow(1000, hashrateUnits.indexOf(modeUnit));
    const series = [{
        title: 'Hashrate',
        x: hashrates.length ? hashrates.map(s => new Date(s.time).toLocaleTimeString()) : [],
        y: hashrates.length ? hashrates.map(s => s.hashRate / factor) : []
    }];
    screen.remove(graphBox);
    screen.append(graphBox);
    graphBox.setLabel(` Hashrate (${modeUnit}) `);
    graphBox.setData(series);
}

function parseHashrate(hashrate) {
    const [num, unit] = hashrate?.split(' ') || [];
    return { hashRate: parseFloat(num || '0') * Math.pow(1000, hashrateUnits.indexOf(unit || hashrateUnits[0])),
        unit: unit || hashrateUnits[0] };
}

async function updateData(useCache) {
    try {
        const now = Date.now();
        const response = useCache ? cache.response : await axios.get(`http://localhost:${PORT}/monitor`);
        cache.response = response;
        const { farmers, balances, session, block } = response.data;
        const getStatus = (status) => {
            const statuses = {
                1: 'PLANTING',
                2: 'WORKING',
                4: 'DONE'
            };
            return statuses[status];
        };
        
        const accounts = Object.entries(farmers).map(([key, value]) => {
            const avgHarvest = value.stats.amount / value.stats.harvestCount;
            const avgFee = value.stats.fees / value.stats.feeCount;
            const avgGap = value.stats.gaps / value.stats.workCount;
            return ({
                address: `${key.slice(0, 4)}..${key.slice(-6)}`,
                balance: balances[key]?.KALE ? `${Number(balances[key]?.KALE).toFixed(3)} KALE` : '-',
                nativeBalance: balances[key]?.XLM ? `${Number(balances[key]?.XLM).toFixed(3)} XLM` : '-',
                harvestStats: value.stats.minAmount && value.stats.maxAmount
                    ? `${Number(value.stats.minAmount).toFixed(3)}/${Number(value.stats.maxAmount).toFixed(3)}/${Number(avgHarvest).toFixed(3)} KALE`
                    : '-',
                feeStats: value.stats.minFee && value.stats.maxFee
                    ? `${Number(value.stats.minFee / 10000000).toFixed(4)}/${Number(value.stats.maxFee / 10000000).toFixed(4)}/${Number(avgFee / 10000000).toFixed(4)} XLM`
                    : '-',
                gapStats: value.stats.minGap && value.stats.maxGap
                ? `${Number(value.stats.minGap)}/${Number(value.stats.maxGap)}/${Number(avgGap).toFixed(1)}`
                : '-',
                status: getStatus(value.status),
                stake: `${value.stats?.stakeBlock || '-'}/${value.stats?.stake?.toFixed(3) || '-'} ${ value.stats?.stakeBlock ? 'KALE' : ''}`,
                gapzeros: value.stats?.lastBlock ? `${value.stats?.workGap || '-'}/${value.stats?.lastDiff || '-'}` : '-/-',
                harvest: `${value.stats?.lastBlock || '-'}/${value.stats?.lastAmount?.toFixed(3) || '-'} ${ value.stats?.lastBlock ? 'KALE' : ''}`,
                total: `${(value.stats?.amount || 0).toFixed(3)} KALE`,
                fees: `${((value.stats?.fees || 0) / 10000000).toFixed(3)} XLM`
            });
        });

        const totals = Object.values(farmers).reduce(
            (acc, farmer) => {
                acc.harvest += farmer.stats.amount;
                acc.fees += farmer.stats.fees;
                return acc;
            },
            { harvest: 0, fees: 0 }
        );
        totals.time = session?.time || now;

        const blockData = {
            index: block?.block,
            time: Number(block?.details?.timestamp) * 1000,
            staked: `${(Number(block?.details?.staked_total) / 10000000).toFixed(3)} KALE`
        };
        session.earnRate = (totals.harvest / ((now - totals.time) / 60000)).toFixed(3);

        if (session?.log) {
            session.log.forEach(entry => {
                if (!log.has(entry.stamp)) {
                    logBox.log(`[${new Date(entry.stamp).toLocaleTimeString()}] ${entry.msg}`);
                    log.add(entry.stamp);
                }
            });

            if (log.size > 50) {
                const trimmed = Array.from(log).slice(-50);
                log.clear();
                trimmed.forEach(stamp => log.add(stamp));
            }
        }

        const { hashRate, unit } = parseHashrate(session.hashrate);
        if (hashRate && (hashrates.length === 0 || now - hashrates[hashrates.length - 1].time >= hashRateInterval)) {
            hashrates.push({ hashRate, time: now, unit });
            if (hashrates.length > hashRateCount) {
                hashrates.shift();
            }
        }

        const status = !Object.keys(balances).length
        || !block?.details
        || !Object.keys(farmers).length
        || session.gpu === undefined
        || session.launchTube === undefined
        || !session.hashrate
            ? 'Awaiting harvest data...'
            : 'Ready - processing data';

        statusBox.setContent(status);
        tipBox.setContent(`F2: toggle additional stats `);

        renderFarmersTable(accounts);
        renderHarvestTable(totals);
        renderBlockTable(blockData);
        renderSystemTable(session);
        renderGraph();
        recalcLayout();
    } catch (error) {
        renderFarmersTable();
        renderHarvestTable();
        renderBlockTable();
        renderSystemTable();
        recalcLayout();
        statusBox.setContent('Homestead connection lost...');
        logBox.log(`Error fetching data ${error.message}`);
    }
}

async function run() {
    await updateData();
    setTimeout(run, 1000);
}

(() => {
    if (config.monitor?.showGraph ?? true) {
        screen.append(graphBox);
    }
    screen.append(harvestTable);
    screen.append(blockTable);
    screen.append(systemTable);
    screen.append(farmersTable);
    screen.append(logBox);
    screen.append(statusBox);
    screen.append(tipBox);
    recalcLayout();
    run();
})();
