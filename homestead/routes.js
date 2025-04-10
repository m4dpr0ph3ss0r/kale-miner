/*!
 * This file is part of kale-miner.
 * Author: Fred Kyung-jin Rezeau <fred@litemint.com>
 */

const express = require('express');
const { invoke, hoard, blockData, balances, signers, session } = require('./contract');
const router = express.Router();
const path = require('path');

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

router.get('/monitor', async (req, res) => {
    try {
        res.json({
            block: convert(blockData),
            session,
            balances,
            farmers: Object.fromEntries(Object.entries(signers).map(([key, value]) => [key, (({ secret, ...rest }) => rest)(value)]))
        });
    } catch (error) {
        res.status(500).send(error.message);
    }
});

router.get('/plant', async (req, res) => {
    const { farmer, amount } = req.query;
    try {
        res.json({ result: await invoke('plant', { farmer, amount }) });
    } catch (error) {
        res.status(500).send(error.message);
    }
});

router.get('/work', async (req, res) => {
    const { farmer, hash, nonce } = req.query;
    try {
        res.json({ result: await invoke('work', { farmer, hash, nonce }) }); 
    } catch (error) {
        res.status(500).send(error.message);
    }
});

router.get('/harvest', async (req, res) => {
    const { farmer, block } = req.query;
    try {
        res.json({ result: await invoke('harvest', { farmer, block }) }); 
    } catch (error) {
        res.status(500).send(error.message);
    }
});

router.get('/data', async (req, res) => {
    res.json(convert(blockData));
});

router.get('/shader', (req, res) => {
    res.sendFile(path.join(__dirname, '../utils/keccak.wgsl'));
});

router.get('/balances', async (req, res) => {
    res.json(balances);
});

router.post('/hoard', async (req, res) => {
    try {
        res.json({ result: await hoard() }); 
    } catch (error) {
        res.status(500).send(error.message);
    }
});

module.exports = router;