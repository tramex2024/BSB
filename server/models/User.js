/**
 * BSB/server/models/User.js
 * MODELO DE USUARIO - Gestión de Sesiones, Credenciales y Roles
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
        index: true 
    },
    
    // --- ROL DE USUARIO ---
    // Define qué partes de la aplicación puede ver y usar
    role: {
        type: String,
        enum: ['current', 'advanced', 'admin'],
        default: 'current',
        required: true
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
    
    token: { 
        type: String,
        default: null
    },
    tokenExpires: { 
        type: Date,
        default: null
    },

    bitmartApiKey: {
        type: String, 
        default: null
    },
    bitmartSecretKeyEncrypted: { 
        type: String,
        default: null
    },
    bitmartApiMemo: {
        type: String, 
        default: null
    },
    
    bitmartApiValidated: {
        type: Boolean,
        default: false
    }

}, { 
    timestamps: true 
});

userSchema.pre('save', function(next) {
    if (this.isModified('bitmartSecretKeyEncrypted')) {
        console.log(`[USER-MODEL] Credentials updated for: ${this.email}`);
    }
    next();
});

module.exports = mongoose.model('User', userSchema);