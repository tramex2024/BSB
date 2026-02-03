/**
 * BSB/server/models/Autobot.js
 * Modelo Unificado de Estado y Configuración (Long, Short & AI)
 */

const mongoose = require('mongoose');

const autobotSchema = new mongoose.Schema({
    total_profit: { type: Number, default: 0 },
    
    // --- ESTADOS DE OPERACIÓN ---
    lstate: { type: String, default: 'STOPPED' },
    sstate: { type: String, default: 'STOPPED' },
    aistate: { type: String, default: 'STOPPED' }, // Estado motor IA
    
    // --- SALDOS OPERATIVOS ---
    lbalance: { type: Number, default: 0 }, 
    sbalance: { type: Number, default: 0 },
    aibalance: { type: Number, default: 0 }, // Saldo asignado a IA

    // --- RAÍZ LONG (L...) ---
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

    // --- RAÍZ SHORT (S...) ---
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

    // --- RAÍZ AI (AI...) ---
    aippc: { type: Number, default: 0 },        // Precio promedio compra IA
    aiac: { type: Number, default: 0 },         // Cantidad acumulada IA
    ailastEntryPrice: { type: Number, default: 0 },
    aihighestPrice: { type: Number, default: 0 },
    ailastOrder: { type: Object, default: null },
    aistartTime: { type: Date, default: null },
    ainorder: { type: Number, default: 0 },

    // --- CONTROL DE TARGETS Y CICLOS ---
    ltprice: { type: Number, default: 0 }, 
    stprice: { type: Number, default: 0 }, 
    aitprice: { type: Number, default: 0 }, // Target price IA
    lprofit: { type: Number, default: 0 }, 
    sprofit: { type: Number, default: 0 },
    aiprofit: { type: Number, default: 0 }, // Profit acumulado IA
    lcycle: { type: Number, default: 0 },
    scycle: { type: Number, default: 0 },
    aicycle: { type: Number, default: 0 }, // Ciclos completados IA
    slep: { type: Number, default: 0 }, 
    llep: { type: Number, default: 0 }, 

    // --- SINCRONIZACIÓN DE EXCHANGE ---
    lastAvailableUSDT: { type: Number, default: 0 },
    lastAvailableBTC: { type: Number, default: 0 },
    lastBalanceCheck: { type: Date, default: Date.now },

    // --- CONFIGURACIÓN (Protegida contra sobreescritura) ---
    config: {
        symbol: { type: String, default: "BTC_USDT" },
        long: {
            enabled: { type: Boolean, default: false },
            amountUsdt: { type: Number },
            purchaseUsdt: { type: Number },
            price_var: { type: Number },
            size_var: { type: Number },
            profit_percent: { type: Number },
            price_step_inc: { type: Number },
            stopAtCycle: { type: Boolean, default: false }
        },
        short: {
            enabled: { type: Boolean, default: false },
            amountUsdt: { type: Number },
            purchaseUsdt: { type: Number },
            price_var: { type: Number },
            size_var: { type: Number },
            profit_percent: { type: Number },
            price_step_inc: { type: Number },
            stopAtCycle: { type: Boolean, default: false }
        },
        ai: {
            enabled: { type: Boolean, default: false },
            amountUsdt: { type: Number },
            stopAtCycle: { type: Boolean, default: false }
            // Se puede extender con parámetros específicos de IA si se desea
        }
    },

    lastUpdate: { type: Date, default: Date.now },
    lastUpdateTime: { type: Date, default: Date.now }
}, { 
    minimize: false 
});

// Middleware de actualización automática de timestamps
autobotSchema.pre('save', function(next) {
    this.lastUpdate = new Date();
    this.lastUpdateTime = new Date();
    next();
});

module.exports = mongoose.model('Autobot', autobotSchema);