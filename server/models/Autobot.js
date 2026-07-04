/**
 * BSB/server/models/Autobot.js
 * Modelo Unificado - Versión blindada con constantes de sistema
 */

const mongoose = require('mongoose');
const { MIN_USDT_VALUE_FOR_BITMART } = require('../utils/tradeConstants');

const autobotSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true, 
        unique: true, 
        index: true 
    },

    total_profit: { type: Number, default: 0 },
    
    // Estados y Saldos
    lstate: { type: String, default: 'STOPPED' },
    sstate: { type: String, default: 'STOPPED' },
    aistate: { type: String, default: 'STOPPED' }, 
    lbalance: { type: Number, default: 0 }, 
    sbalance: { type: Number, default: 0 },
    aibalance: { type: Number, default: 0 }, 

    // Raíces operativas (Long/Short/AI)
    lppc: { type: Number, default: 0 },
    lac: { type: Number, default: 0 },
    lai: { type: Number, default: 0 },
    locc: { type: Number, default: 0 }, 
    llastOrder: { type: Object, default: null },
    lpm: { type: Number, default: 0 },
    lpc: { type: Number, default: 0 },    
    lrca: { type: Number, default: 0 }, 
    lncp: { type: Number, default: 0 }, 
    lcoverage: { type: Number, default: 0 }, 
    lstartTime: { type: Date, default: null },
    lnorder: { type: Number, default: 0 },

    sppc: { type: Number, default: 0 },
    sac: { type: Number, default: 0 },
    sai: { type: Number, default: 0 },
    socc: { type: Number, default: 0 }, 
    slastOrder: { type: Object, default: null },
    spm: { type: Number, default: 0 },
    spc: { type: Number, default: 0 },    
    srca: { type: Number, default: 0 }, 
    sncp: { type: Number, default: 0 }, 
    scoverage: { type: Number, default: 0 }, 
    sstartTime: { type: Date, default: null },
    snorder: { type: Number, default: 0 },

    // AI
    aippc: { type: Number, default: 0 }, 
    aiac: { type: Number, default: 0 }, 
    ailastEntryPrice: { type: Number, default: 0 },
    aihighestPrice: { type: Number, default: 0 },
    ailastOrder: { type: Object, default: null },
    aistartTime: { type: Date, default: null },
    ainorder: { type: Number, default: 0 },

    // Targets y Ciclos
    ltprice: { type: Number, default: 0 }, 
    stprice: { type: Number, default: 0 }, 
    aitprice: { type: Number, default: 0 }, 
    lprofit: { type: Number, default: 0 }, 
    sprofit: { type: Number, default: 0 },
    aiprofit: { type: Number, default: 0 }, 
    lcycle: { type: Number, default: 0 },
    scycle: { type: Number, default: 0 },
    aicycle: { type: Number, default: 0 }, 
    slep: { type: Number, default: 0 }, 
    llep: { type: Number, default: 0 }, 

    // Sincronización
    lastAvailableUSDT: { type: Number, default: 0 },
    lastAvailableBTC: { type: Number, default: 0 },
    lastBalanceCheck: { type: Date, default: Date.now },

    // CONFIGURACIÓN (Blindada)
    config: {
        symbol: { type: String, default: "BTC_USDT" },
        long: {
            enabled: { type: Boolean, default: false },
            amountUsdt: { type: Number, default: MIN_USDT_VALUE_FOR_BITMART, min: MIN_USDT_VALUE_FOR_BITMART },
            purchaseUsdt: { type: Number, default: MIN_USDT_VALUE_FOR_BITMART, min: MIN_USDT_VALUE_FOR_BITMART },
            price_var: { type: Number, default: 0.5, min: 0.01 },
            size_var: { type: Number, default: 1.1, min: 1.0 },   // Ajustado a rango lógico (1.0 = lineal, >1.0 = exponencial)
            profit_percent: { type: Number, default: 1.2, min: 0.01 },
            price_step_inc: { type: Number, default: 0, min: 0 },
            stopAtCycle: { type: Boolean, default: false }
        },
        short: {
            enabled: { type: Boolean, default: false },
            amountUsdt: { type: Number, default: MIN_USDT_VALUE_FOR_BITMART, min: MIN_USDT_VALUE_FOR_BITMART },
            purchaseUsdt: { type: Number, default: MIN_USDT_VALUE_FOR_BITMART, min: MIN_USDT_VALUE_FOR_BITMART },
            price_var: { type: Number, default: 0.5, min: 0.01 },
            size_var: { type: Number, default: 1.1, min: 1.0 },
            profit_percent: { type: Number, default: 1.2, min: 0.01 },
            price_step_inc: { type: Number, default: 0, min: 0 },
            stopAtCycle: { type: Boolean, default: false }
        },
        ai: {
            enabled: { type: Boolean, default: false },
            amountUsdt: { type: Number, default: 100 },
            minConfidence: { type: Number, default: 0.60 },
            profitPercent: { type: Number, default: 0.3 }, 
            trailingPercent: { type: Number, default: 0.1 }, 
            maxOrders: { type: Number, default: 3 },
            stopAtCycle: { type: Boolean, default: false }
        }
    },

    lastUpdate: { type: Date, default: Date.now },
    lastUpdateTime: { type: Date, default: Date.now }
}, { 
    minimize: false 
});

autobotSchema.pre('save', function(next) {
    this.lastUpdate = new Date();
    this.lastUpdateTime = new Date();
    next();
});

module.exports = mongoose.model('Autobot', autobotSchema);