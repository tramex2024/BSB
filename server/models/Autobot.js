const mongoose = require('mongoose');

const AutobotSchema = new mongoose.Schema({
    lstate: { type: String, default: 'STOPPED' },
    sstate: { type: String, default: 'STOPPED' },

    config: {
        symbol: { type: String, default: 'BTC_USDT' },
        long: {
            amountUsdt: { type: Number, default: 0 },   // Monto total asignado
            purchaseUsdt: { type: Number, default: 0 }, // Monto base (Orden 0)
            size_var: { type: Number, default: 100 },   // Multiplicador exponencial de tamaño (%)
            price_var: { type: Number, default: 1.5 },  // Distancia base entre órdenes (%)
            price_step_inc: { type: Number, default: 0 }, // Incremento de distancia entre coberturas (%)
            trigger: { type: Number, default: 1.5 },    // Take Profit deseado (%)
            stopAtCycle: { type: Boolean, default: false },
            enabled: { type: Boolean, default: false }
        },
        short: {
            amountUsdt: { type: Number, default: 0 },
            purchaseUsdt: { type: Number, default: 0 },
            size_var: { type: Number, default: 100 },
            price_var: { type: Number, default: 1.5 },
            price_step_inc: { type: Number, default: 0 },
            trigger: { type: Number, default: 1.5 },
            stopAtCycle: { type: Boolean, default: false },
            enabled: { type: Boolean, default: false }
        }
    },

    // Métricas de desempeño acumuladas
    total_profit: { type: Number, default: 0 },
    lprofit: { type: Number, default: 0 },
    sprofit: { type: Number, default: 0 },
    
    // Datos operativos en tiempo real
    lbalance: { type: Number, default: 0 }, // Capital usado en Long
    sbalance: { type: Number, default: 0 }, // Capital usado en Short
    ltprice: { type: Number, default: 0 }, // Precio promedio de compra (PPC)
    stprice: { type: Number, default: 0 }, // Precio promedio de venta (PPV)
    lcycle: { type: Number, default: 0 },  // Contador de ciclos Long
    scycle: { type: Number, default: 0 },  // Contador de ciclos Short
    lcoverage: { type: Number, default: 0 }, // Precio de liquidación/cobertura máxima
    scoverage: { type: Number, default: 0 },
    lsprice: { type: Number, default: 0 }, // Último precio de compra
    sbprice: { type: Number, default: 0 }, // Último precio de venta
    lnorder: { type: Number, default: 0 }, // Número de coberturas activas
    snorder: { type: Number, default: 0 },

    // Información de cuenta sincronizada
    lastAvailableUSDT: { type: Number, default: 0 },
    lastAvailableBTC: { type: Number, default: 0 },
    
    lastUpdate: { type: Date, default: Date.now }
});

// Middleware para actualizar la fecha automáticamente
AutobotSchema.pre('save', function(next) {
    this.lastUpdate = Date.now();
    next();
});

module.exports = mongoose.model('Autobot', AutobotSchema);