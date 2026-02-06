// server/models/BotState.js
const mongoose = require('mongoose');

// Define el esquema para el estado y configuración de tu bot para cada usuario.
const BotStateSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true // Asegura que cada usuario tenga solo una entrada de estado de bot
    },
    // Estado de ejecución del bot
    isRunning: {
        type: Boolean,
        default: false // Indica si el bot está actualmente en ejecución
    },
    state: { // Puede ser 'RUNNING', 'STOPPED', 'SELLING', etc.
        type: String,
        default: 'STOPPED'
    },
    cycle: {
        type: Number,
        default: 0
    },
    profit: {
        type: Number,
        default: 0.00
    },
    cycleProfit: {
        type: Number,
        default: 0.00
    },
    // Configuración del bot
    purchase: {
        type: Number,
        default: 5.00 // Valor inicial predeterminado
    },
    increment: {
        type: Number,
        default: 100 // Valor inicial predeterminado
    },
    decrement: {
        type: Number,
        default: 1.0 // Valor inicial predeterminado
    },
    trigger: {
        type: Number,
        default: 1.5 // Valor inicial predeterminado
    },
    stopAtCycleEnd: {
        type: Boolean,
        default: false // Valor inicial predeterminado
    }
}, {
    timestamps: true // Añade campos createdAt y updatedAt automáticamente
});

// Crea el modelo Mongoose a partir del esquema
const BotState = mongoose.model('BotState', BotStateSchema);

module.exports = BotState;
