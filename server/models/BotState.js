// server/models/BotState.js

const mongoose = require('mongoose');

// Define el esquema para el estado del bot
const BotStateSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true // Asegura que cada usuario tiene solo una entrada de estado general
    },
    autobot: { // Estado específico para el Autobot
        state: {
            type: String,
            enum: ['STOPPED', 'RUNNING', 'BUYING', 'SELLING', 'NO_COVERAGE', 'ERROR'],
            default: 'STOPPED'
        },
        cycle: { type: Number, default: 0 },
        profit: { type: Number, default: 0 },
        cycleProfit: { type: Number, default: 0 },
        currentPrice: { type: Number, default: 0 },
        purchaseAmount: { type: Number, default: 0 }, // ORDER SIZE del frontend
        incrementPercentage: { type: Number, default: 0 }, // INCREMENT del frontend
        decrementPercentage: { type: Number, default: 0 }, // DECREMENT del frontend
        triggerPercentage: { type: Number, default: 0 }, // TRIGGER del frontend
        ppc: { type: Number, default: 0 }, // Precio Promedio de Compra
        cp: { type: Number, default: 0 }, // Capital Comprado (total USDT gastado en el ciclo)
        ac: { type: Number, default: 0 }, // Activo Comprado (total BTC adquirido en el ciclo)
        pm: { type: Number, default: 0 }, // Precio Máximo (usado en estado SELLING)
        pv: { type: Number, default: 0 }, // Precio de Venta (calculado a partir de PM)
        pc: { type: Number, default: 0 }, // Precio de Caída (usado en estado SELLING)
        lastOrder: { // Detalles de la última orden (para calcular siguiente decrecimiento)
            orderId: String,
            price: Number,
            size: Number,
            side: String,
            type: String,
            state: String
        },
        openOrders: { type: Array, default: [] }, // Registro de órdenes abiertas
        orderCountInCycle: { type: Number, default: 0 },
        lastOrderUSDTAmount: { type: Number, default: 0 },
        nextCoverageUSDTAmount: { type: Number, default: 0 },
        nextCoverageTargetPrice: { type: Number, default: 0 },
        stopOnCycleEnd: { type: Boolean, default: false }
    },
    aibot: { // Estado específico para el AIBot
        state: {
            type: String,
            enum: ['STOPPED', 'RUNNING', 'BUYING', 'SELLING', 'ERROR', 'LICENSE_EXPIRED'],
            default: 'STOPPED'
        },
        licenseEndDate: { // Fecha de finalización de la licencia
            type: Date,
            default: Date.now // Por defecto, se establece en la fecha actual, lo que significa que la licencia está expirada al inicio.
        },
        cycle: { type: Number, default: 0 },
        profit: { type: Number, default: 0 },
        cycleProfit: { type: Number, default: 0 },
        currentPrice: { type: Number, default: 0 },
        ppc: { type: Number, default: 0 }, // Precio Promedio de Compra
        cp: { type: Number, default: 0 }, // Capital Comprado (total USDT gastado en el ciclo)
        ac: { type: Number, default: 0 }, // Activo Comprado (total BTC adquirido en el ciclo)
        highestPriceReached: { type: Number, default: 0 }, // Para trailing stop
        lastBuyPrice: { type: Number, default: 0 }, // Último precio de compra para calcular trailing stop de break-even
        positionActive: { type: Boolean, default: false }, // true si tenemos una posición abierta
        tradingEnabled: { type: Boolean, default: true }, // Podría deshabilitarse si se detecta un problema grave
        settings: { // Configuración del AIBot (ej. % de riesgo, etc.)
            riskPerTradePercentage: { type: Number, default: 1 }, // % del balance total a arriesgar por trade
            initialBuyAmountUSDT: { type: Number, default: 10 }, // Monto inicial para la primera compra
            maxDCAOrders: { type: Number, default: 3 }, // Máximo de órdenes de cobertura
            dcaPriceDropPercentage: { type: Number, default: 1.5 }, // % de caída para DCA
            takeProfitPercentage: { type: Number, default: 2 }, // Objetivo de ganancia inicial
            trailingStopLossPercentage: { type: Number, default: 0.5 }, // % de trailing para stop loss
            trailingTakeProfitPercentage: { type: Number, default: 0.8 } // % de trailing para take profit
        },
        dcaOrdersPlaced: { type: Number, default: 0 }, // Contador de órdenes DCA en el ciclo actual
        openOrders: { type: Array, default: [] }, // Mantener un registro de órdenes abiertas
        // Aquí puedes agregar más campos específicos para el AIBot
        // Por ejemplo, historial de decisiones, confianza de la señal, etc.
    }
}, {
    timestamps: true // Añade campos createdAt y updatedAt automáticamente
});

// Crea el modelo Mongoose a partir del esquema
const BotState = mongoose.model('BotState', BotStateSchema);

module.exports = BotState;