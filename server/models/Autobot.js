// Archivo: BSB/server/models/Autobot.js
const mongoose = require('mongoose');

const AutobotSchema = new mongoose.Schema({
    // Estados
    lstate: { type: String, default: 'STOPPED' },
    sstate: { type: String, default: 'STOPPED' },

    // Configuración (Estructura Original)
    config: {
        long: {
            amountUsdt: { type: Number, default: 0 },
            purchaseUsdt: { type: Number, default: 0 },
            stopAtCycle: { type: Boolean, default: false }
        },
        short: {
            amountUsdt: { type: Number, default: 0 },
            purchaseUsdt: { type: Number, default: 0 },
            stopAtCycle: { type: Boolean, default: false }
        },
        // Campos de lógica exponencial (Originalmente fuera de long/short o compartidos)
        size_var: { type: Number, default: 0 },
        price_var: { type: Number, default: 0 },
        trigger: { type: Number, default: 0 } 
    },

    // Métricas
    total_profit: { type: Number, default: 0 },
    lprofit: { type: Number, default: 0 },
    sprofit: { type: Number, default: 0 },
    lbalance: { type: Number, default: 0 },
    sbalance: { type: Number, default: 0 },
    ltprice: { type: Number, default: 0 },
    stprice: { type: Number, default: 0 },
    lcycle: { type: Number, default: 0 },
    scycle: { type: Number, default: 0 },
    lcoverage: { type: Number, default: 0 },
    scoverage: { type: Number, default: 0 },
    lsprice: { type: Number, default: 0 },
    sbprice: { type: Number, default: 0 },
    lnorder: { type: Number, default: 0 },
    snorder: { type: Number, default: 0 },

    // Balances de cuenta
    lastAvailableUSDT: { type: Number, default: 0 },
    lastAvailableBTC: { type: Number, default: 0 },
    
    lastUpdate: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Autobot', AutobotSchema);