/**
 * BSB/server/models/Order.js
 * REGISTRO INDIVIDUAL DE OPERACIONES EN EL EXCHANGE
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
        // AGREGAMOS 'ex' a la lista para permitir órdenes externas
        enum: ['long', 'short', 'ai', 'ex'], 
        required: true,
        index: true
    },
    // Índice del ciclo al que pertenece
    cycleIndex: { 
        type: Number, 
        required: false, // 👈 Cambiado a false para que las órdenes 'ex' puedan guardarse con 0 o vacío
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
    fee: { type: Number, default: 0 },            // Comisión pagada (Opcional)
    
    status: { 
        type: String, 
        default: 'FILLED',
        enum: ['FILLED', 'CANCELED', 'PARTIALLY_FILLED', 'PENDING']
    },
    orderTime: { type: Date, default: Date.now }
}, { 
    timestamps: true 
});

// Índice compuesto para auditorías rápidas
orderSchema.index({ userId: 1, cycleIndex: 1, strategy: 1 });

module.exports = mongoose.model('Order', orderSchema);