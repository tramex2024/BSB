// server/models/Aibot.js

const mongoose = require('mongoose');

const AibotSchema = new mongoose.Schema({
    isRunning: { type: Boolean, default: false },
    virtualBalance: { type: Number, default: 100.00 },    
    lastEntryPrice: { type: Number, default: 0 },
    highestPrice: { type: Number, default: 0 },
    lastUpdate: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Aibot', AibotSchema);