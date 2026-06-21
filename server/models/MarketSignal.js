/**
 * BSB/server/models/MarketSignal.js
 * CENTRAL DE INTELIGENCIA DE MERCADO - Modelo Centralizado y Optimizado para IA
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

    // --- NUEVO BLOQUE DE VOLATILIDAD Y TENDENCIA (Para gestión de salida) ---
    atr: { type: Number, default: 0 },         // Average True Range
    volatilityIndex: { type: Number, default: 0 },
    priceSlope: { type: Number, default: 0 },   // Pendiente de tendencia (Delta de precio)

    // --- BLOQUE DE INTELIGENCIA ARTIFICIAL ---
    aiConfidence: { 
        type: Number, 
        default: 0,
        min: 0,
        max: 1 
    },
    marketPhase: { 
        type: String, 
        enum: ['ACCUMULATION', 'TREND', 'DISTRIBUTION', 'DORMANT', 'UNKNOWN'],
        default: 'UNKNOWN'
    },
    // Contenedor para los inputs normalizados que consumirá XGBoost
    featureVector: {
        type: Object,
        default: {}
    },

    // --- LEGADO Y COMPATIBILIDAD ---
    currentRSI: { type: Number, required: true }, 
    prevRSI: { type: Number, required: true },
    signal: { 
        type: String, 
        required: true,
        // 🟢 AUDITORÍA: Se expande el enum para admitir las señales de momentum exclusivas del bot de IA
        enum: ['BUY', 'SELL', 'HOLD', 'STRONG_BUY', 'STRONG_SELL', 'AIBUY', 'AISELL'] 
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

// Middleware de actualización para asegurar que la marca de tiempo siempre sea actual
MarketSignalSchema.pre('save', function(next) {
    this.lastUpdate = Date.now();
    next();
});

module.exports = mongoose.model('MarketSignal', MarketSignalSchema);