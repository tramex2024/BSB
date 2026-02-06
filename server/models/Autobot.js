// models/Autobot.js (MODELO ACTUALIZADO - Stop Independiente)

const mongoose = require('mongoose');

// =========================================================================
// ESQUEMA DE DATOS DE ESTRATEGIA (ÚNICO para Long y Short)
// =========================================================================
const strategyDataSchema = new mongoose.Schema({
    ppc: { type: Number, default: 0 }, 
    ac: { type: Number, default: 0 },    
    ai: { type: Number, default: 0 }, 
    orderCountInCycle: { type: Number, default: 0 },
    lastOrder: { type: Object, default: null },
    pm: { type: Number, default: 0 }, 
    pc: { type: Number, default: 0 },    
    lastExecutionPrice: { type: Number, default: 0 },
    requiredCoverageAmount: { type: Number, default: 0 }, 
    nextCoveragePrice: { type: Number, default: 0 },
    cycleStartTime: { type: Date, default: null } 
});

// =========================================================================
// ESQUEMA DE CONFIGURACIÓN (CON STOP AT CYCLE INDEPENDIENTE)
// =========================================================================
const configSchema = new mongoose.Schema({
    symbol: { type: String, default: "BTC_USDT" },
    long: {
        enabled: { type: Boolean, default: false },
        amountUsdt: { type: Number, default: 6.00 },
        purchaseUsdt: { type: Number, default: 6.00 },
        price_var: { type: Number, default: 0.1 },
        size_var: { type: Number, default: 5.0 },
        profit_percent: { type: Number, default: 1.5 },
        stopAtCycle: { type: Boolean, default: false } 
    },
    short: {
        enabled: { type: Boolean, default: false },        
        amountUsdt: { type: Number, default: 6.00 }, 
        purchaseUsdt: { type: Number, default: 6.00 }, 
        price_var: { type: Number, default: 0.1 },
        size_var: { type: Number, default: 5.0 },
        profit_percent: { type: Number, default: 1.5 },
        stopAtCycle: { type: Boolean, default: false } 
    }
    // 🔴 Se eliminó stopAtCycle de la raíz para evitar colisiones globales
});

// =========================================================================
// ESQUEMA PRINCIPAL DE AUTOBOT
// =========================================================================
const autobotSchema = new mongoose.Schema({
    total_profit: { type: Number, default: 0.00 },
    lstate: { type: String, default: 'STOPPED' },
    sstate: { type: String, default: 'STOPPED' },
    lbalance: { type: Number, default: 0.00 }, 
    sbalance: { type: Number, default: 0.00 }, 
    
    lastAvailableUSDT: { type: Number, default: 0.00 },
    lastAvailableBTC: { type: Number, default: 0.00 },
    lastBalanceCheck: { type: Date, default: Date.now },

    ltprice: { type: Number, default: 0.00 }, 
    stprice: { type: Number, default: 0.00 }, 

    lsprice: { type: Number, default: 0.00 }, 
    sbprice: { type: Number, default: 0.00 }, 
    
    lprofit: { type: Number, default: 0.00 }, 
    sprofit: { type: Number, default: 0.00 },

    lcycle: { type: Number, default: 0 },
    scycle: { type: Number, default: 0 },
    
    lcoverage: { type: Number, default: 0.00 }, 
    scoverage: { type: Number, default: 0.00 },
 
    lnorder: { type: Number, default: 0 }, 
    snorder: { type: Number, default: 0 }, 
    
    lStateData: { type: strategyDataSchema, default: {} },
    sStateData: { type: strategyDataSchema, default: {} },

    config: { type: configSchema, default: {} },
    lastUpdateTime: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Autobot', autobotSchema);