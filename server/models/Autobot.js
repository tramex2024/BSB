// models/Autobot.js (FINALIZADO - Soporte Long y Short Completo)

const mongoose = require('mongoose');

// =========================================================================
// ESQUEMA DE DATOS DE ESTRATEGIA (ÚNICO para Long y Short)
// * ppc/pps: Precio Promedio de Compra/Venta en Corto
// * ac: Cantidad Acumulada de BTC/Activo
// * pm: Price Maximum (Long) / Price Minimum (Short)
// * pc: Price Cover/Cutoff (Trailing Stop/Protection)
// =========================================================================
const strategyDataSchema = new mongoose.Schema({
    ppc: { type: Number, default: 0 }, // Long: Precio Promedio de Compra (PPC) | Short: Precio Promedio de Short (PPS)
    ac: { type: Number, default: 0 }, // Cantidad Acumulada de BTC/Activo
    ppv: { type: Number, default: 0 }, // Este campo no es usado en tu lógica actual, se mantiene por si acaso
    av: { type: Number, default: 0 }, // Este campo no es usado en tu lógica actual, se mantiene por si acaso
    orderCountInCycle: { type: Number, default: 0 },
    lastOrder: { type: Object, default: null },
    pm: { type: Number, default: 0 }, // Long: Máximo Alcanzado | Short: Mínimo Alcanzado
    pc: { type: Number, default: 0 }, // Precio de Corte/Cubrimiento (Trailing Stop)
    // 💡 AÑADIDO: Campos de Contingencia para NO_COVERAGE
    requiredCoverageAmount: { type: Number, default: 0 }, 
    nextCoveragePrice: { type: Number, default: 0 }
});

// =========================================================================
// ESQUEMA DE CONFIGURACIÓN
// =========================================================================
const configSchema = new mongoose.Schema({
    symbol: { type: String, default: "BTC_USDT" },
    long: {
        enabled: { type: Boolean, default: false },
        amountUsdt: { type: Number, default: 5.00 },
        purchaseUsdt: { type: Number, default: 5.00 },
        price_var: { type: Number, default: 0.1 },
        size_var: { type: Number, default: 5.0 },
        profit_percent: { type: Number, default: 1.5 } // Renombrado de 'trigger'
    },
    short: {
        enabled: { type: Boolean, default: false },        
	amountBtc: { type: Number, default: 0.00005 }, // Capital total asignado (BTC)
        sellBtc: { type: Number, default: 0.00005 }, // Monto de la orden inicial/cobertura (BTC)
        price_var: { type: Number, default: 0.1 },
        size_var: { type: Number, default: 5.0 },
        profit_percent: { type: Number, default: 1.5 } 
    },
    stopAtCycle: { type: Boolean, default: false }
});

// =========================================================================
// ESQUEMA PRINCIPAL DE AUTOBOT
// =========================================================================
const autobotSchema = new mongoose.Schema({
    // ✅ Campo totalProfit, que ya está definido correctamente.
    totalProfit: { type: Number, default: 10000.00 },
    lstate: { type: String, default: 'STOPPED' },
    sstate: { type: String, default: 'STOPPED' },
    lbalance: { type: Number, default: 0 },
    sbalance: { type: Number, default: 0 },
    
    // 💡 ltprice ya fue renombrado a LTPrice dentro de lStateData (ajuste necesario)
    // Se mantiene aquí por si lo usas en el Front-End.
    ltprice: { type: Number, default: 0 }, 
    stprice: { type: Number, default: 0 }, 

    lcycle: { type: Number, default: 0 },
    scycle: { type: Number, default: 0 },
    
    // 💡 COBERTURA/ÓRDENES PENDIENTES (Se usan para el Front-End)
    lcoverage: { type: Number, default: 0 }, 
    scoverage: { type: Number, default: 0 }, 
    lnorder: { type: Number, default: 0 }, 
    snorder: { type: Number, default: 0 }, 
    
    lStateData: { type: strategyDataSchema, default: {} },
    sStateData: { type: strategyDataSchema, default: {} }, // 💡 AÑADIDO: SStateData
    config: { type: configSchema, default: {} },
    lastUpdateTime: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Autobot', autobotSchema);
