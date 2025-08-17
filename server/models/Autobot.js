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
        purchaseUsdt: { type: Number, default: 5.00 },
        price_var: { type: Number, default: 0.1 },
        size_var: { type: Number, default: 5.0 },
        trigger: { type: Number, default: 0.2 },
        maxOrders: { type: Number, default: 5 }
    },
    short: {
        enabled: { type: Boolean, default: false },
        sellBtc: { type: Number, default: 0.00004 },
        price_var: { type: Number, default: 0.1 },
        size_var: { type: Number, default: 5.0 },
        trigger: { type: Number, default: 0.2 },
        maxOrders: { type: Number, default: 5 }
    },
    stopAtCycle: { type: Boolean, default: false }
});

const autobotSchema = new mongoose.Schema({
    lstate: { type: String, default: 'STOPPED' },
    sstate: { type: String, default: 'STOPPED' },
    lStateData: { type: strategyDataSchema, default: {} },
    sStateData: { type: strategyDataSchema, default: {} },
    config: { type: configSchema, default: {} },
    lastUpdateTime: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Autobot', autobotSchema);