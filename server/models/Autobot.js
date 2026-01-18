const mongoose = require('mongoose');

// =========================================================================
// ESQUEMA DE DATOS INTERNO (Mantiene la compatibilidad con el pasado)
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
// ESQUEMA PRINCIPAL (Híbrido: Espejo en Raíz + Objetos Originales)
// =========================================================================
const autobotSchema = new mongoose.Schema({
    total_profit: { type: Number, default: 0 },
    lstate: { type: String, default: 'STOPPED' },
    sstate: { type: String, default: 'STOPPED' },
    lbalance: { type: Number, default: 0 }, 
    sbalance: { type: Number, default: 0 },

    // --- NUEVOS CAMPOS EN RAÍZ PARA LONG (Espejo de lStateData) ---
    lppc: { type: Number, default: 0 },
    lac: { type: Number, default: 0 },
    lai: { type: Number, default: 0 },
    lnorder: { type: Number, default: 0 }, 
    llastOrder: { type: Object, default: null },
    lpm: { type: Number, default: 0 },
    lpc: { type: Number, default: 0 },
    lsprice: { type: Number, default: 0 }, 
    lreqAmount: { type: Number, default: 0 }, 
    lcoverage: { type: Number, default: 0 }, 
    lstartTime: { type: Date, default: null },

    // --- NUEVOS CAMPOS EN RAÍZ PARA SHORT (Espejo de sStateData) ---
    sppc: { type: Number, default: 0 },
    sac: { type: Number, default: 0 },
    sai: { type: Number, default: 0 },
    snorder: { type: Number, default: 0 }, 
    slastOrder: { type: Object, default: null },
    spm: { type: Number, default: 0 },
    spc: { type: Number, default: 0 },
    sbprice: { type: Number, default: 0 }, 
    sreqAmount: { type: Number, default: 0 }, 
    scoverage: { type: Number, default: 0 }, 
    sstartTime: { type: Date, default: null },

    // --- PARÁMETROS DE DESEMPEÑO Y CONTROL ---
    ltprice: { type: Number, default: 0 }, 
    stprice: { type: Number, default: 0 }, 
    lprofit: { type: Number, default: 0 }, 
    sprofit: { type: Number, default: 0 },
    lcycle: { type: Number, default: 0 },
    scycle: { type: Number, default: 0 },

    // --- DATOS DE CUENTA Y SINCRONIZACIÓN ---
    lastAvailableUSDT: { type: Number, default: 0 },
    lastAvailableBTC: { type: Number, default: 0 },
    lastBalanceCheck: { type: Date, default: Date.now },

    // --- OBJETOS ORIGINALES (NO SE TOCAN, SE MANTIENEN POR SEGURIDAD) ---
    lStateData: { type: strategyDataSchema, default: {} },
    sStateData: { type: strategyDataSchema, default: {} },

    // --- CONFIGURACIÓN DE LA ESTRATEGIA ---
    config: {
        symbol: { type: String, default: "BTC_USDT" },
        long: {
            enabled: { type: Boolean, default: false },
            amountUsdt: { type: Number, default: 6.00 },
            purchaseUsdt: { type: Number, default: 6.00 },
            price_var: { type: Number, default: 0.1 },
            size_var: { type: Number, default: 5.0 },
            profit_percent: { type: Number, default: 1.5 },
            price_step_inc: { type: Number, default: 0 }, // Nuevo parámetro exponencial
            stopAtCycle: { type: Boolean, default: false }
        },
        short: {
            enabled: { type: Boolean, default: false },
            amountUsdt: { type: Number, default: 6.00 },
            purchaseUsdt: { type: Number, default: 6.00 },
            price_var: { type: Number, default: 0.1 },
            size_var: { type: Number, default: 5.0 },
            profit_percent: { type: Number, default: 1.5 },
            price_step_inc: { type: Number, default: 0 }, // Nuevo parámetro exponencial
            stopAtCycle: { type: Boolean, default: false }
        }
    },

    // --- MARCADORES DE TIEMPO ---
    lastUpdate: { type: Date, default: Date.now },
    lastUpdateTime: { type: Date, default: Date.now }
});

// Middleware para que lastUpdate siempre se actualice automáticamente
autobotSchema.pre('save', function(next) {
    this.lastUpdate = new Date();
    this.lastUpdateTime = new Date(); // Actualizamos ambos por compatibilidad
    next();
});

module.exports = mongoose.model('Autobot', autobotSchema);