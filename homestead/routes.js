/*!
 * This file is part of kale-miner.
 * Author: Fred Kyung-jin Rezeau <fred@litemint.com>
 */

const express = require('express');
const { invoke, blockData, balances } = require('./contract');
const router = express.Router();

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
    res.json(convert(blockData));
});

router.get('/balances', async (req, res) => {
    res.json(balances);
});

module.exports = router;