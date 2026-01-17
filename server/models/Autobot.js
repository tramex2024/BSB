const mongoose = require('mongoose');

const AutobotSchema = new mongoose.Schema({
    lstate: { type: String, default: 'STOPPED' },
    sstate: { type: String, default: 'STOPPED' },

    config: {
        long: {
            amountUsdt: { type: Number, default: 0 },
            purchaseUsdt: { type: Number, default: 0 },
            stopAtCycle: { type: Boolean, default: false },
            // Mover aquí para independencia
            size_var: { type: Number, default: 0 },
            price_var: { type: Number, default: 0 },
            trigger: { type: Number, default: 0 } 
        },
        short: {
            amountUsdt: { type: Number, default: 0 },
            purchaseUsdt: { type: Number, default: 0 },
            stopAtCycle: { type: Boolean, default: false },
            // Mover aquí para independencia
            size_var: { type: Number, default: 0 },
            price_var: { type: Number, default: 0 },
            trigger: { type: Number, default: 0 }
        }
        // Eliminamos las variables sueltas de aquí para evitar confusión
    },

    total_profit: { type: Number, default: 0 },
    lprofit: { type: Number, default: 0 },
    sprofit: { type: Number, default: 0 },
    lbalance: { type: Number, default: 0 },
    sbalance: { type: Number, default: 0 },
    ltprice: { type: Number, default: 0 },
    stprice: { type: Number, default: 0 },
    lcycle: { type: Number, default: 0 },
    scycle: { type: Number, default: 0 },
    lcoverage: { type: Number, default: 0 },
    scoverage: { type: Number, default: 0 },
    lsprice: { type: Number, default: 0 },
    sbprice: { type: Number, default: 0 },
    lnorder: { type: Number, default: 0 },
    snorder: { type: Number, default: 0 },

    lastAvailableUSDT: { type: Number, default: 0 },
    lastAvailableBTC: { type: Number, default: 0 },
    
    lastUpdate: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Autobot', AutobotSchema);