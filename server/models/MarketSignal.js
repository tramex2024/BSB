/**
 * BSB/server/models/MarketSignal.js
 * CENTRAL DE INTELIGENCIA DE MERCADO
 */

const mongoose = require('mongoose');

const MarketSignalSchema = new mongoose.Schema({
    symbol: { 
        type: String, 
        default: 'BTC_USDT', 
        unique: true,
        index: true 
    },
    
    // --- DATOS DE PRECIO EN TIEMPO REAL ---
    currentPrice: { type: Number, required: true },
    prevPrice: { type: Number },
    priceChange24h: { type: Number }, // Útil para filtros de volatilidad

    // --- BLOQUE DE INDICADORES TÉCNICOS ---
    rsi14: { type: Number },
    rsi21: { type: Number }, 
    adx: { type: Number },   
    
    // Estocástico (K y D)
    stochK: { type: Number },
    stochD: { type: Number },

    // MACD (Añadido: Fundamental para confirmar cruces de tendencia)
    macdValue: { type: Number },
    macdSignal: { type: Number },
    macdHist: { type: Number },

    // --- LEGADO Y COMPATIBILIDAD ---
    currentRSI: { type: Number, required: true }, 
    prevRSI: { type: Number, required: true },
    signal: { 
        type: String, 
        required: true,
        // En MarketSignal.js
enum: ['BUY', 'SELL', 'HOLD', 'STRONG_BUY', 'STRONG_SELL'] 
    }, 
    reason: { type: String },

    // --- DATOS ESTRUCTURALES ---
    // Guardamos solo las últimas X velas para no saturar la DB
    history: { type: Array, default: [] }, 
    trend: { 
        type: String, 
        enum: ['BULLISH', 'BEARISH', 'NEUTRAL', 'SIDEWAYS'], 
        default: 'NEUTRAL' 
    },
    
    lastUpdate: { type: Date, default: Date.now }
}, {
    timestamps: true // Para tener createdAt y updatedAt nativos
});

// Middleware de actualización
MarketSignalSchema.pre('save', function(next) {
    this.lastUpdate = Date.now();
    next();
});

module.exports = mongoose.model('MarketSignal', MarketSignalSchema);