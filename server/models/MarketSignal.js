// server/models/MarketSignal.js

const mongoose = require('mongoose');

const MarketSignalSchema = new mongoose.Schema({
    symbol: { type: String, default: 'BTC_USDT', unique: true },
    currentRSI: { type: Number, required: true },
    prevRSI: { type: Number, required: true },
    signal: { type: String, required: true }, // BUY, SELL, HOLD
    reason: { type: String },
    lastUpdate: { type: Date, default: Date.now }
});

module.exports = mongoose.model('MarketSignal', MarketSignalSchema);