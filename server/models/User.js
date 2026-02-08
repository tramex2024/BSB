/**
 * BSB/server/models/User.js
 * MODELO DE USUARIO - Gestión de Sesiones y Credenciales Cifradas
 */

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^[\w-]+(?:\.[\w-]+)*@(?:[\w-]+\.)+[a-zA-Z]{2,7}$/, 'Please fill a valid email address'],
        index: true // Optimiza la búsqueda durante el login
    },
    
    autobotId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Autobot',
        default: null 
    },

    jwtToken: {
        type: String,
        default: null,
    },
    
    // AUTH OTP: No son requeridos para permitir limpieza tras validación
    token: { 
        type: String,
        default: null
    },
    tokenExpires: { 
        type: Date,
        default: null
    },

    // CREDENCIALES BITMART (Cifradas con AES-256 via encryption.js)
    bitmartApiKey: {
        type: String, // Guardaremos el valor cifrado aquí
        default: null
    },
    bitmartSecretKeyEncrypted: { 
        type: String,
        default: null
    },
    bitmartApiMemo: {
        type: String, // El memo también se recomienda cifrarlo
        default: null
    },
    
    bitmartApiValidated: {
        type: Boolean,
        default: false
    }

}, { 
    timestamps: true // Gestiona automáticamente createdAt y updatedAt
});

// Middleware opcional para debug (puedes borrarlo después)
userSchema.pre('save', function(next) {
    if (this.isModified('bitmartSecretKeyEncrypted')) {
        console.log(`[USER-MODEL] Credentials updated for: ${this.email}`);
    }
    next();
});

module.exports = mongoose.model('User', userSchema);