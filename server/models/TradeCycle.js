/**
 * BSB/server/models/TradeCycle.js
 * HISTORIAL DE CICLOS CERRADOS (Performance & Analytics)
 */

const mongoose = require('mongoose');

const tradeCycleSchema = new mongoose.Schema({
    // VÍNCULO MULTIUSUARIO
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true, 
        index: true 
    },
    
    // Identificación del Ciclo
    strategy: { 
        type: String, 
        required: true, 
        enum: ['Long', 'Short', 'AI'] // 👈 Añadido 'AI'
    },
    cycleIndex: { type: Number, required: true },
    symbol: { type: String, required: true, default: 'BTC_USDT' },
    
    // Métricas de Tiempo
    startTime: { type: Date, required: true },
    endTime: { type: Date, default: Date.now },
    durationHours: { type: Number },
    
    // Métricas Financieras
    initialInvestment: { type: Number, required: true }, // Total USDT invertido en este ciclo
    finalRecovery: { type: Number, required: true },    // Total USDT recuperado al vender
    netProfit: { type: Number, required: true },        // Ganancia neta final
    profitPercentage: { type: Number, required: true }, // % real de beneficio
    
    // Detalle de la Operación
    averagePPC: { type: Number, required: true },       // Precio Promedio del ciclo
    finalSellPrice: { type: Number, required: true },   // Precio de cierre
    orderCount: { type: Number, required: true },       // Cuántas recompras hubo
    
    // Estado del ciclo
    status: { 
        type: String, 
        default: 'COMPLETED', 
        enum: ['COMPLETED', 'PANIC_SELL', 'MANUAL_CLOSE'] 
    },

    // Referencia al ID del Bot (Legado/Referencia)
    autobotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Autobot', required: true }
}, { 
    timestamps: true 
});

// --------------------------------------------------------
// ÍNDICES PARA ALTO RENDIMIENTO (Dashboard & Charts)
// --------------------------------------------------------
// Este índice permite que la gráfica de equidad cargue instantáneamente
tradeCycleSchema.index({ userId: 1, strategy: 1, endTime: -1 });

module.exports = mongoose.model('TradeCycle', tradeCycleSchema);