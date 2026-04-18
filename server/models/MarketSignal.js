/**
 * BSB/server/models/MarketSignal.js
 * CENTRAL DE INTELIGENCIA DE MERCADO - Modelo con IA
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
    priceChange24h: { type: Number },

    // --- BLOQUE DE INDICADORES TÉCNICOS ---
    rsi14: { type: Number },
    rsi21: { type: Number }, 
    adx: { type: Number },   
    
    // Estocástico (K y D)
    stochK: { type: Number },
    stochD: { type: Number },

    // MACD
    macdValue: { type: Number },
    macdSignal: { type: Number },
    macdHist: { type: Number },

    // --- NUEVO BLOQUE DE INTELIGENCIA ARTIFICIAL ---
    aiConfidence: { 
        type: Number, 
        default: 0,
        min: 0,
        max: 1 // Guardamos de 0 a 1 (ej: 0.85 para 85%)
    },
    marketPhase: { 
        type: String, 
        enum: ['ACCUMULATION', 'TREND', 'DISTRIBUTION', 'DORMANT', 'UNKNOWN'],
        default: 'UNKNOWN'
    },

    // --- LEGADO Y COMPATIBILIDAD ---
    currentRSI: { type: Number, required: true }, 
    prevRSI: { type: Number, required: true },
    signal: { 
        type: String, 
        required: true,
        enum: ['BUY', 'SELL', 'HOLD', 'STRONG_BUY', 'STRONG_SELL'] 
    }, 
    reason: { type: String },

    // --- DATOS ESTRUCTURALES ---
    history: { type: Array, default: [] }, 
    trend: { 
        type: String, 
        enum: ['BULLISH', 'BEARISH', 'NEUTRAL', 'SIDEWAYS'], 
        default: 'NEUTRAL' 
    },
    
    lastUpdate: { type: Date, default: Date.now }
}, {
    timestamps: true 
});

// Middleware de actualización
MarketSignalSchema.pre('save', function(next) {
    this.lastUpdate = Date.now();
    next();
});

module.exports = mongoose.model('MarketSignal', MarketSignalSchema);