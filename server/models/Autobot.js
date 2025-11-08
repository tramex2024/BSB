// models/Autobot.js (FINALIZADO - Soporte Long y Short Completo)

const mongoose = require('mongoose');

// =========================================================================
// ESQUEMA DE DATOS DE ESTRATEGIA (ÚNICO para Long y Short)
// * ppc: Precio Promedio de Compra (Long)
// * pps: Precio Promedio de Venta (Short)
// * ac: Cantidad Acumulada de BTC/Activo
// * pm: Price Maximum (Long) / Price Minimum (Short)
// * pc: Price Cover/Cutoff (Trailing Stop/Protection)
// * ai: Amount Invested
// =========================================================================
// 💡 FIX: Se añade { minimize: false } para asegurar que Mongoose incluya
// todos los campos por defecto (como 'ai') al cargar documentos antiguos.
const strategyDataSchema = new mongoose.Schema({
    ppc: { type: Number, default: 0 }, // Long: Precio Promedio de Compra (PPC) | Short: Precio Promedio de Short (PPS)
    ac: { type: Number, default: 0 }, // Cantidad Acumulada de BTC/Activo     
    ai: { type: Number, default: 0 }, // Monto de usdt invertido en compras activas para calcular ganancias.
    orderCountInCycle: { type: Number, default: 0 },
    lastOrder: { type: Object, default: null },
    pm: { type: Number, default: 0 }, // Long: Máximo Alcanzado | Short: Mínimo Alcanzado
    pc: { type: Number, default: 0 }, // Precio de Corte/Cubrimiento (Trailing Stop)
    // 💡 AÑADIDO: Campos de Contingencia para NO_COVERAGE
    requiredCoverageAmount: { type: Number, default: 0 }, 
    nextCoveragePrice: { type: Number, default: 0 }
}, { minimize: false }); // <--- FIX APLICADO AQUÍ

// =========================================================================
// ESQUEMA DE CONFIGURACIÓN
// =========================================================================
const configSchema = new mongoose.Schema({
    symbol: { type: String, default: "BTC_USDT" },
    long: {
        enabled: { type: Boolean, default: false },
        amountUsdt: { type: Number, default: 5.00 },
        purchaseUsdt: { type: Number, default: 6.00 },
        price_var: { type: Number, default: 0.1 },
        size_var: { type: Number, default: 5.0 },
        profit_percent: { type: Number, default: 1.5 } // Renombrado de 'trigger'
    },
    short: {
        enabled: { type: Boolean, default: false },        
        amountBtc: { type: Number, default: 0.00005 }, // Capital total asignado (BTC)
        sellBtc: { type: Number, default: 0.00005 }, // Monto de la orden inicial/cobertura (BTC)
        price_var: { type: Number, default: 0.1 }, // Asegurado 0.1 para coincidir con tu esquema
        size_var: { type: Number, default: 5.0 },
        profit_percent: { type: Number, default: 1.5 } 
    },
    stopAtCycle: { type: Boolean, default: false }
}, { minimize: false }); // <--- AÑADIDO AQUÍ POR CONSISTENCIA

// =========================================================================
// ESQUEMA PRINCIPAL DE AUTOBOT
// =========================================================================
const autobotSchema = new mongoose.Schema({
    
    total_profit: { type: Number, default: 0.00 },
    lstate: { type: String, default: 'STOPPED' },
    sstate: { type: String, default: 'STOPPED' },
    lbalance: { type: Number, default: 0.00 },
    sbalance: { type: Number, default: 0.00 },
    
    ltprice: { type: Number, default: 0.00 }, 
    stprice: { type: Number, default: 0.00 }, 

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