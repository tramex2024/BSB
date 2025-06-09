// server/models/BotState.js
const mongoose = require('mongoose');

const botStateSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    state: { type: String, default: 'STOPPED' }, // Asegurado que es 'state'
    cycle: { type: Number, default: 0 },
    profit: { type: Number, default: 0 },
    cycleProfit: { type: Number, default: 0 }, // Ganancia o pérdida del ciclo actual
    currentPrice: { type: Number, default: 0 },
    purchaseAmount: { type: Number, default: 0 }, // ORDER SIZE del frontend
    incrementPercentage: { type: Number, default: 0 }, // INCREMENT del frontend
    decrementPercentage: { type: Number, default: 0 }, // DECREMENT del frontend
    triggerPercentage: { type: Number, default: 0 }, // TRIGGER del frontend
    ppc: { type: Number, default: 0 }, // Precio Promedio de Compra
    cp: { type: Number, default: 0 },  // Capital Comprado (total USDT gastado en el ciclo)
    ac: { type: Number, default: 0 },  // Activo Comprado (total BTC adquirido en el ciclo)
    pm: { type: Number, default: 0 },  // Precio Máximo (usado en estado SELLING)
    pv: { type: Number, default: 0 },  // Precio de Venta (calculado a partir de PM)
    pc: { type: Number, default: 0 },  // Precio de Caída (usado en estado SELLING)
    lastOrder: { type: Object, default: null }, // Detalles de la última orden (para calcular siguiente decrecimiento)
    openOrders: { type: Array, default: [] }, // Mantener un registro de órdenes abiertas colocadas por el bot
    orderCountInCycle: { type: Number, default: 0 }, // Contador de órdenes en el ciclo actual
    lastOrderUSDTAmount: { type: Number, default: 0 }, // Monto en USDT de la última orden
    nextCoverageUSDTAmount: { type: Number, default: 0 }, // Monto para la próxima orden de cobertura
    nextCoverageTargetPrice: { type: Number, default: 0 }, // Precio objetivo para la próxima orden de cobertura
    stopOnCycleEnd: { type: Boolean, default: false } // Bandera para detener al final del ciclo
}, { timestamps: true });

module.exports = mongoose.model('BotState', botStateSchema);