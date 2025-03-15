/*!
 * This file is part of kale-miner.
 * Author: Fred Kyung-jin Rezeau <fred@litemint.com>
 */

const blessed = require('blessed');
const axios = require('axios');
const PORT = process.env.PORT || 3002;

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

function recalcLayout() {
    const layouts = [
        { element: blockTable, props: { top: 1, left: '50%+1', width: '50%-3', height: 4 } },
        { element: harvestTable, props: { top: 1, left: 1, width: '50%-1', height: 4 } },
        { element: systemTable, props: { top: 5, left: 1, width: '100%-4', height: 4 } },
        { element: farmersTable, props: { top: 9, left: 1, width: '100%-4', height: '30%' } },
        { element: logBox, props: { bottom: 1, left: 1, width: '100%-4', height: 9 } }
    ];
    layouts.forEach(({ element, props }) => {
        Object.assign(element, props);
    });
    screen.render();
}

screen.on('resize', () => {
    recalcLayout();
});
screen.key(['escape', 'q', 'C-c'], () => process.exit(0));

screen.append(harvestTable);
screen.append(blockTable);
screen.append(systemTable);
screen.append(farmersTable);
screen.append(logBox);

const log = new Set();
const pad = str => ` ${str}`;
const formatSessionTime = (time) => {
    const elapsed = Date.now() - time;
    return `${Math.floor(elapsed / (1000 * 60 * 60 * 24))}d ${Math.floor(elapsed / (1000 * 60 * 60)) % 24}h ${Math.floor(elapsed / (1000 * 60)) % 60}m ${Math.floor(elapsed / 1000) % 60}s`;
};

function renderFarmersTable(farmers) {
    const data = [
        [pad('Farmer'), pad('Balance'), pad('Status'), pad('Block/Stake (Last)'), pad('Block/Gap/Harvest (Last)'), pad('Total Harvest'), pad('Total Fee')],
    ];
    farmers.forEach(farmer => {
        data.push([
            pad(String(farmer.address)),
            pad(String(farmer.balance)),
            pad(String(farmer.status)),
            pad(String(farmer.stake)),
            pad(String(farmer.harvest)),
            pad(String(farmer.total)),
            pad(String(farmer.fees))
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
        [pad('GPU'), pad('Hash Rate'), pad('KALE/min'), pad(system?.launchTube ? 'LaunchTube Credits' : 'LaunchTube')],
    ];
    if (system) {
        data.push([
            pad(String(system.gpu || '-').toUpperCase()),
            pad(String(system.hashrate || '-')),
            pad(String(system.earnRate || '-')),
            ` ${system.credits ? String(Number(system.credits).toFixed(3) || 'N/A') : 'N/A'} XLM`
        ])
    }
    systemTable.setData(data);
}

async function updateData() {
    try {
        const response = await axios.get(`http://localhost:${PORT}/monitor`);
        const { farmers, balances, session, block } = response.data;
        const getStatus = (status) => {
            const statuses = {
                1: 'PLANTING',
                2: 'WORKING',
                4: 'DONE'
            };
            return statuses[status];
        };

        const accounts = Object.entries(farmers).map(([key, value]) => ({
            address: `${key.slice(0, 4)}..${key.slice(-6)}`,
            balance: balances[key]?.KALE ? `${Number(balances[key]?.KALE).toFixed(3)} KALE` : '- KALE',
            status: getStatus(value.status),
            stake: `${value.stats?.stakeBlock || '-'}/${value.stats?.stake?.toFixed(3) || '-'} KALE`,
            harvest: `${value.stats?.lastBlock || '-'}/${value.stats?.workGap || '-'}/${value.stats?.lastAmount?.toFixed(3) || '-'} KALE`,
            total: `${(value.stats?.amount || 0).toFixed(3)} KALE`,
            fees: `${((value.stats?.fees || 0) / 10000000).toFixed(3)} XLM`
        }));

        const totals = Object.values(farmers).reduce(
            (acc, farmer) => {
                acc.harvest += farmer.stats.amount;
                acc.fees += farmer.stats.fees;
                return acc;
            },
            { harvest: 0, fees: 0 }
        );
        totals.time = session?.time || Date.now();

        const blockData = {
            index: block?.block,
            time: Number(block?.details?.timestamp) * 1000,
            staked: `${(Number(block?.details?.staked_total) / 10000000).toFixed(3)} KALE`
        };
        session.earnRate = (totals.harvest / ((Date.now() - totals.time) / 60000)).toFixed(3);

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

        renderFarmersTable(accounts);
        renderHarvestTable(totals);
        renderBlockTable(blockData);
        renderSystemTable(session);
        recalcLayout();
    } catch (error) {
        logBox.log(`Error fetching data ${error.message}`);
    }
}

async function run() {
    await updateData();
    setTimeout(run, 1000);
}
run();
