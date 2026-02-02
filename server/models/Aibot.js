// server/models/Aibot.js

const mongoose = require('mongoose');

const AibotSchema = new mongoose.Schema({
    // Estado del motor
    isRunning: { type: Boolean, default: false },
    
    // Configuración de capital definida por el usuario
    amountUsdt: { type: Number, default: 100.00 }, // Monto inicial de entrenamiento
    
    // Estado financiero actual (acumulado)
    virtualBalance: { type: Number, default: 100.00 }, 
    
    // Rastreo de posición activa (Crucial para el Trailing Stop)
    lastEntryPrice: { type: Number, default: 0 },
    highestPrice: { type: Number, default: 0 }, // Punto más alto alcanzado desde la compra
    
    // Configuración adicional
    stopAtCycle: { type: Boolean, default: false }, // Detener tras la próxima venta
    
    // Auditoría
    lastUpdate: { type: Date, default: Date.now }
});

// Middleware para actualizar la fecha antes de guardar
AibotSchema.pre('save', function(next) {
    this.lastUpdate = new Date();
    next();
});

module.exports = mongoose.model('Aibot', AibotSchema);