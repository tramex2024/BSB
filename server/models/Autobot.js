const mongoose = require('mongoose');

// =========================================================================
// ESQUEMA PRINCIPAL (Estructura Plana 2026 - Lógica Exponencial)
// =========================================================================
const autobotSchema = new mongoose.Schema({
    total_profit: { type: Number, default: 0 },
    lstate: { type: String, default: 'STOPPED' },
    sstate: { type: String, default: 'STOPPED' },
    lbalance: { type: Number, default: 0 }, 
    sbalance: { type: Number, default: 0 },

    // --- RAÍZ LONG (L...) ---
    lppc: { type: Number, default: 0 },
    lac: { type: Number, default: 0 },
    lai: { type: Number, default: 0 },
    locc: { type: Number, default: 0 }, 
    llastOrder: { type: Object, default: null },
    lpm: { type: Number, default: 0 },
    lpc: { type: Number, default: 0 },
    lsprice: { type: Number, default: 0 }, 
    lrca: { type: Number, default: 0 }, 
    lncp: { type: Number, default: 0 }, 
    lcoverage: { type: Number, default: 0 }, 
    lstartTime: { type: Date, default: null },
    lnorder: { type: Number, default: 0 },

    // --- RAÍZ SHORT (S...) ---
    sppc: { type: Number, default: 0 },
    sac: { type: Number, default: 0 },
    sai: { type: Number, default: 0 },
    socc: { type: Number, default: 0 }, 
    slastOrder: { type: Object, default: null },
    spm: { type: Number, default: 0 },
    spc: { type: Number, default: 0 },
    sbprice: { type: Number, default: 0 }, 
    srca: { type: Number, default: 0 }, 
    sncp: { type: Number, default: 0 }, 
    scoverage: { type: Number, default: 0 }, 
    sstartTime: { type: Date, default: null },
    snorder: { type: Number, default: 0 },

    // --- CONTROL DE TARGETS Y CICLOS ---
    ltprice: { type: Number, default: 0 }, 
    stprice: { type: Number, default: 0 }, 
    lprofit: { type: Number, default: 0 }, 
    sprofit: { type: Number, default: 0 },
    lcycle: { type: Number, default: 0 },
    scycle: { type: Number, default: 0 },
    slep: { type: Number, default: 0 }, 
    llep: { type: Number, default: 0 }, 

    // --- SINCRONIZACIÓN DE EXCHANGE ---
    lastAvailableUSDT: { type: Number, default: 0 },
    lastAvailableBTC: { type: Number, default: 0 },
    lastBalanceCheck: { type: Date, default: Date.now },

    // --- CONFIGURACIÓN (Lógica Exponencial) ---
    config: {
        symbol: { type: String, default: "BTC_USDT" },
        long: {
            enabled: { type: Boolean, default: false },
            amountUsdt: { type: Number, default: 6.00 },
            purchaseUsdt: { type: Number, default: 6.00 },
            price_var: { type: Number, default: 0.5 },
            size_var: { type: Number, default: 100 },
            profit_percent: { type: Number, default: 1.5 },
            price_step_inc: { type: Number, default: 2.0 },
            stopAtCycle: { type: Boolean, default: false }
        },
        short: {
            enabled: { type: Boolean, default: false },
            amountUsdt: { type: Number, default: 6.00 },
            purchaseUsdt: { type: Number, default: 6.00 },
            price_var: { type: Number, default: 0.5 },
            size_var: { type: Number, default: 100 },
            profit_percent: { type: Number, default: 1.5 },
            price_step_inc: { type: Number, default: 2.0 },
            stopAtCycle: { type: Boolean, default: false }
        }
    },

    lastUpdate: { type: Date, default: Date.now },
    lastUpdateTime: { type: Date, default: Date.now }
});

// Middleware de actualización automática
autobotSchema.pre('save', function(next) {
    this.lastUpdate = new Date();
    this.lastUpdateTime = new Date();
    next();
});

module.exports = mongoose.model('Autobot', autobotSchema);