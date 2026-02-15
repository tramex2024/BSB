/**
 * BSB/server/models/Order.js
 * REGISTRO INDIVIDUAL DE OPERACIONES EN EL EXCHANGE
 * Versión Sincronizada 2026 - Valores de Estrategia Estrictos
 */

const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true,
        index: true 
    },
    strategy: { 
        type: String,
        lowercase: true,
        // Valores estrictos: 'ex' para BitMart API, 'long/short/ai' para estrategias internas
        enum: ['long', 'short', 'ai', 'ex'], 
        required: true,
        index: true
    },
    // Índice del ciclo al que pertenece (0 para órdenes 'ex')
    cycleIndex: { 
        type: Number, 
        required: false, 
        default: 0
    },
    executionMode: { 
        type: String, 
        enum: ['REAL', 'SIMULATED'], 
        default: 'REAL'
    },
    // ID único devuelto por BitMart
    orderId: { 
        type: String, 
        required: true, 
        unique: true 
    }, 
    symbol: { type: String, default: 'BTC_USDT' },
    side: { 
        type: String, 
        enum: ['BUY', 'SELL'], 
        uppercase: true, 
        required: true 
    },
    type: { type: String, default: 'MARKET' },
    
    // Métricas de la Orden
    size: { type: Number, required: true },       // Cantidad de Crypto (BTC)
    price: { type: Number, required: true },      // Precio de ejecución
    notional: { type: Number },                   // Total en USDT (size * price)
    fee: { type: Number, default: 0 },            // Comisión pagada
    
    status: { 
        type: String, 
        default: 'FILLED',
        uppercase: true,
        // Estados reales que BitMart reporta en sus diferentes versiones de API
        enum: ['FILLED', 'CANCELED', 'CANCELLED', 'PARTIALLY_FILLED', 'PENDING', 'NEW', 'OPEN', 'ACTIVE']
    },
    orderTime: { type: Date, default: Date.now }
}, { 
    timestamps: true 
});

// Índices para optimización de consultas
orderSchema.index({ userId: 1, strategy: 1, status: 1 });
orderSchema.index({ orderTime: -1 });

module.exports = mongoose.model('Order', orderSchema);