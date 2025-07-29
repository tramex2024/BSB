// server/models/Order.js

const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Referencia al usuario
    orderId: { type: String, required: true, unique: true }, // ID único de la orden de BitMart
    symbol: { type: String, required: true }, // BTC_USDT
    side: { type: String, required: true, enum: ['Buy', 'Sell'] }, // Buy o Sell
    notional: { type: Number, required: true }, // Cantidad en USDT (valor total)
    price: { type: Number, required: true }, // Precio de la orden
    status: { type: String, required: true, enum: ['Open', 'Filled', 'Canceled', 'Partially Filled', 'Partially Canceled'] }, // Estado de la orden
    orderTime: { type: Date, default: Date.now }, // Timestamp de la orden
    // Puedes añadir más campos según necesites, como fee, actualAmount, etc.
});

// Índice para búsquedas rápidas por usuario y orderId
orderSchema.index({ userId: 1, orderId: 1 });

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;