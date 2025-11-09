// server/models/BotState.js

const mongoose = require('mongoose');

// =================================================================
// 1. ESQUEMA PARA DATOS DE ESTADO (LONG y SHORT)
// El objeto { _id: false } es crucial para evitar la generación de _id duplicados
// en los subdocumentos anidados (como lStateData y sStateData).
// =================================================================
const StateDataSchema = new mongoose.Schema({
    // Propiedades de Estado de Posición (Long o Short)
    ppc: { type: Number, default: 0.00 }, // Precio Promedio de Compra (Price Per Coin)
    ac: { type: Number, default: 0 },    // Cantidad Acumulada de la moneda
    ai: { type: Number, default: 0 },    // Contador interno de intentos o pasos de DCA
    orderCountInCycle: { type: Number, default: 0 }, // Contador de órdenes en el ciclo actual
    
    // Almacenamiento de la última orden (para seguimiento de BitMart)
    lastOrder: {
        type: new mongoose.Schema({
            orderId: { type: String, required: true },
            type: { type: String, required: true }, // 'BUY' o 'SELL'
            amount: { type: Number, required: true }, // Cantidad en USDT invertida o a recibir
            price: { type: Number, required: true },
            timestamp: { type: Date, default: Date.now }
        }, { _id: false }), // <--- ¡Importante! Evita el _id en la orden
        default: null
    },
    
    // Propiedades de Trading
    requiredCoverageAmount: { type: Number, default: 0.00 }, // Monto en USDT para la siguiente orden DCA
    nextCoveragePrice: { type: Number, default: 0.00 },     // Precio para la siguiente orden DCA

    // Variables internas que tu bot podría usar
    pm: { type: Number, default: 0.00 }, // Posiblemente 'Porcentaje de Margen'
    pc: { type: Number, default: 0.00 }, // Posiblemente 'Precio de Cierre'

}, { _id: false }); // <--- ¡LA CLAVE! ESTO EVITA QUE lStateData/sStateData TENGAN SU PROPIO _id

// =================================================================
// 2. ESQUEMA PRINCIPAL DEL BOT
// =================================================================
const BotStateSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true
    },
    // --- ESTADO GENERAL ---
    isRunning: {
        type: Boolean,
        default: false
    },
    state: { // Puede ser 'RUNNING', 'STOPPED', 'PAUSED'
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

    // --- DATOS DE POSICIÓN ---
    lbalance: { type: Number, default: 0.00 }, // Capital asignado a LONG
    sbalance: { type: Number, default: 0.00 }, // Capital asignado a SHORT
    
    // Precios de Venta/Límite (Targets)
    ltprice: { type: Number, default: 0.00 }, // Target de Venta Long
    stprice: { type: Number, default: 0.00 }, // Target de Venta Short
    lcoverage: { type: Number, default: 0.00 }, // Precio Límite de Cobertura Long
    scoverage: { type: Number, default: 0.00 }, // Precio Límite de Cobertura Short
    lnorder: { type: Number, default: 0 }, // Contador máximo de órdenes Long
    snorder: { type: Number, default: 0 }, // Contador máximo de órdenes Short

    // --- DATOS DE ESTADO DE POSICIÓN (Subdocumentos sin _id) ---
    lStateData: {
        type: StateDataSchema,
        default: () => ({}) // Asegura que se inicialice como un objeto vacío
    },
    sStateData: {
        type: StateDataSchema,
        default: () => ({}) // Asegura que se inicialice como un objeto vacío
    },

    // --- CONFIGURACIÓN (Si esta configuración también fuera un subdocumento) ---
    // Si la quieres guardar como un objeto simple, solo usa type: Object:
    config: {
        type: Object, // Usamos Object para evitar definir un nuevo esquema aquí
        default: {}
    },


}, {
    timestamps: true // Añade campos createdAt y updatedAt automáticamente
});

const BotState = mongoose.model('BotState', BotStateSchema);

module.exports = BotState;