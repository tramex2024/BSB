// server/models/Order.js
const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    strategy: { // Define si pertenece a Long o Short
        type: String,
        enum: ['long', 'short'], // Restringe los valores posibles
        required: true
    },
    orderId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    symbol: {
        type: String,
        required: true
    },
    side: { // 'buy' or 'sell'
        type: String,
        required: true
    },
    type: { // 'limit' or 'market'
        type: String,
        required: true
    },
    size: { // Quantity of base currency for sell, or base currency for limit buy. For market buy, this is notional.
        type: Number,
        required: true
    },
    notional: { // USDT amount for market buy, or value of the order
        type: Number
    },
    price: { // Price for limit orders or average filled price for market orders
        type: Number
    },
    filledSize: {
        type: Number,
        default: 0
    },
    status: { // 'Open', 'Filled', 'Canceled', 'Partially Filled', 'Partially Canceled'
        type: String,
        required: true
    },
    orderTime: {
        type: Date,
        required: true
    },
    // Removido userId temporalmente para simplificar la prueba inicial
}, { timestamps: true }); // Mongoose adds createdAt and updatedAt

module.exports = mongoose.model('Order', orderSchema);