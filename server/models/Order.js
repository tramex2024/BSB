// BSB/server/models/Order.js

const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    strategy: { 
        type: String,
        enum: ['long', 'short', 'ai'],
        required: true,
        index: true
    },
    executionMode: { 
        type: String, 
        enum: ['REAL', 'SIMULATED'], 
        default: 'SIMULATED' // Por ahora todo será SIMULATED hasta que conectes el cable
    },
    orderId: { type: String, required: true, unique: true },
    symbol: { type: String, default: 'BTC_USDT' },
    side: { type: String, enum: ['BUY', 'SELL'], uppercase: true },
    type: { type: String, default: 'MARKET' },
    size: { type: Number, required: true },     // Cantidad BTC
    price: { type: Number, required: true },    // Precio de ejecución
    notional: { type: Number },                 // Total USDT
    status: { type: String, default: 'FILLED' },
    confidenceScore: { type: Number },          // Solo para la estrategia AI
    orderTime: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);