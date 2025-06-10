const mongoose = require('mongoose');

const botStateSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    state: { type: String, default: 'STOPPED' },
    cycle: { type: Number, default: 0 },
    profit: { type: Number, default: 0 },
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
    stopOnCycleEnd: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('BotState', botStateSchema);
