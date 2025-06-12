// server/models/BotState.js
const mongoose = require('mongoose');

const BotStateSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true
    },
    state: { // 'RUNNING', 'STOPPED', 'BUYING', 'SELLING', 'NO_COVERAGE'
        type: String,
        required: true,
        default: 'STOPPED'
    },
    cycle: { // El número del ciclo actual
        type: Number,
        required: true,
        default: 0
    },
    profit: { // Ganancia acumulada total del bot
        type: Number,
        required: true,
        default: 0
    },
    cycleProfit: { // Ganancia o pérdida del ciclo actual
        type: Number,
        required: true,
        default: 0
    },
    currentPrice: { type: Number, default: 0 },
    purchaseAmount: { type: Number, default: 0 },
    incrementPercentage: { type: Number, default: 0 },
    decrementPercentage: { type: Number, default: 0 },
    triggerPercentage: { type: Number, default: 0 },
    ppc: { type: Number, default: 0 },
    cp: { type: Number, default: 0 },
    ac: { type: Number, default: 0 },
    pm: { type: Number, default: 0 },
    pv: { type: Number, default: 0 },
    pc: { type: Number, default: 0 },
    lastOrder: { type: Object, default: null },
    openOrders: { type: Array, default: [] },
    orderCountInCycle: { type: Number, default: 0 },
    lastOrderUSDTAmount: { type: Number, default: 0 },
    nextCoverageUSDTAmount: { type: Number, default: 0 },
    nextCoverageTargetPrice: { type: Number, default: 0 },
    stopOnCycleEnd: { type: Boolean, default: false }
}, {
    timestamps: true
});

const BotState = mongoose.model('BotState', BotStateSchema);

module.exports = BotState;