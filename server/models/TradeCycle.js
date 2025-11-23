// BSB/server/models/TradeCycle.js

const mongoose = require('mongoose');

const tradeCycleSchema = new mongoose.Schema({
    // Identificación del Ciclo
    strategy: { type: String, required: true, enum: ['Long', 'Short'] }, // Long o Short
    cycleIndex: { type: Number, required: true },                      // Contador del ciclo (lcycle/scycle)
    symbol: { type: String, required: true },
    
    // Metricas de Tiempo
    startTime: { type: Date, required: true },                          // Inicio del ciclo (primera compra)
    endTime: { type: Date, default: Date.now },                         // Fin del ciclo (venta exitosa)
    durationHours: { type: Number },                                    // Duración total en horas
    
    // Metricas Financieras
    initialInvestment: { type: Number, required: true },                // AI (Inversión Total Bruta en USDT)
    finalRecovery: { type: Number, required: true },                    // Monto Neto de la Venta (USDT)
    netProfit: { type: Number, required: true },                        // Ganancia Neta (USDT)
    profitPercentage: { type: Number, required: true },                 // % de Ganancia sobre la Inversión
    
    // Detalle de la Operación
    averagePPC: { type: Number, required: true },                       // Precio Promedio de Compra (PPC)
    finalSellPrice: { type: Number, required: true },                   // Precio de Venta (Salida)
    orderCount: { type: Number, required: true },                       // Cantidad de órdenes en el ciclo
    
    // Referencia al ID del Bot
    autobotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Autobot', required: true }
});

module.exports = mongoose.model('TradeCycle', tradeCycleSchema);