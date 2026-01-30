// server/models/MarketSignal.js

const mongoose = require('mongoose');

const MarketSignalSchema = new mongoose.Schema({
    symbol: { type: String, default: 'BTC_USDT', unique: true },
    
    // Compatibilidad con el Autobot viejo
    currentRSI: { type: Number, required: true },
    prevRSI: { type: Number, required: true },
    signal: { type: String, required: true }, 
    reason: { type: String },

    // Nuevos campos para CentralAnalyzer y AIBot
    currentPrice: { type: Number, required: true },
    rsi14: { type: Number },
    history: { type: Array, default: [] }, // Aquí vivirán las 50 velas de contexto
    
    lastUpdate: { type: Date, default: Date.now }
});

module.exports = mongoose.model('MarketSignal', MarketSignalSchema);