// server/models/MarketSignal.js

const mongoose = require('mongoose');

const MarketSignalSchema = new mongoose.Schema({
    symbol: { type: String, default: 'BTC_USDT', unique: true },
    
    // Precios de referencia
    currentPrice: { type: Number, required: true },
    prevPrice: { type: Number },

    // Bloque de Indicadores Técnicos
    rsi14: { type: Number },
    rsi21: { type: Number }, // RSI de mayor plazo para tendencia
    adx: { type: Number },    // Fuerza de la tendencia
    
    // Estocástico (K y D)
    stochK: { type: Number },
    stochD: { type: Number },

    // Legado Autobot (Compatibilidad)
    currentRSI: { type: Number, required: true }, // Generalmente apunta al rsi14
    prevRSI: { type: Number, required: true },
    signal: { type: String, required: true }, 
    reason: { type: String },

    // Datos Estructurales
    history: { type: Array, default: [] }, // Velas cerradas para re-cálculo
    trend: { type: String, enum: ['BULLISH', 'BEARISH', 'NEUTRAL'], default: 'NEUTRAL' },
    
    lastUpdate: { type: Date, default: Date.now }
});

// Middleware para actualizar la fecha automáticamente
MarketSignalSchema.pre('save', function(next) {
    this.lastUpdate = Date.now();
    next();
});

module.exports = mongoose.model('MarketSignal', MarketSignalSchema);