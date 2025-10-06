// models/Autobot.js
const mongoose = require('mongoose');

const strategyDataSchema = new mongoose.Schema({
    ppc: { type: Number, default: 0 },
    ac: { type: Number, default: 0 },
    ppv: { type: Number, default: 0 },
    av: { type: Number, default: 0 },
    orderCountInCycle: { type: Number, default: 0 },
    lastOrder: { type: Object, default: null },
    pm: { type: Number, default: 0 },
    pc: { type: Number, default: 0 },
    pv: { type: Number, default: 0 }
});

const configSchema = new mongoose.Schema({
    symbol: { type: String, default: "BTC_USDT" },
    long: {
        enabled: { type: Boolean, default: false },
        amountUsdt: { type: Number, default: 5.00 },
        purchaseUsdt: { type: Number, default: 5.00 },
        price_var: { type: Number, default: 0.1 },
        size_var: { type: Number, default: 5.0 },
        trigger: { type: Number, default: 0.2 }        
    },
    short: {
        enabled: { type: Boolean, default: false },        
	amountBtc: { type: Number, default: 0.00004 },
        sellBtc: { type: Number, default: 0.00004 },
        price_var: { type: Number, default: 0.1 },
        size_var: { type: Number, default: 5.0 },
        trigger: { type: Number, default: 0.2 }        
    },
    stopAtCycle: { type: Boolean, default: false }
});

const autobotSchema = new mongoose.Schema({
    totalProfit: { type: Number, default: 0 },
    lstate: { type: String, default: 'STOPPED' },
    sstate: { type: String, default: 'STOPPED' },
    lbalance: { type: Number, default: 0 },
    sbalance: { type: Number, default: 0 },
    ltprice: { type: Number, default: 0 },
    stprice: { type: Number, default: 0 },
    lcycle: { type: Number, default: 0 },
    scycle: { type: Number, default: 0 },
    lcoverage: { type: Number, default: 0 },
    scoverage: { type: Number, default: 0 },
    lnorder: { type: Number, default: 0 },
    snorder: { type: Number, default: 0 },
    lStateData: { type: strategyDataSchema, default: {} },
    sStateData: { type: strategyDataSchema, default: {} },
    config: { type: configSchema, default: {} },
    lastUpdateTime: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Autobot', autobotSchema);