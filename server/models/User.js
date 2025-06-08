// backend/models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true
    },
    token: {
        type: String, // El token para el Magic Link
        required: true
    },
    tokenExpires: {
        type: Date,
        required: true
    },
    bitmartApiKey: {
        type: String,
        default: null
    },
    bitmartSecretKeyEncrypted: { // Ahora almacena la clave encriptada
        type: String,
        default: null
    },
    bitmartApiMemo: {
        type: String,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    // ... otros campos que ya tengas
}, {
    timestamps: true // Para createdAt y updatedAt
});

// Middleware de Mongoose para hashear la contraseña antes de guardar
UserSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        return next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// Método para comparar contraseñas
UserSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

// Middleware de Mongoose para encriptar las API keys ANTES de guardar
UserSchema.pre('save', async function (next) {
    if (this.isModified('bitmartApiKey') && this.bitmartApiKey) {
        this.bitmartApiKey = encrypt(this.bitmartApiKey);
    }
    if (this.isModified('bitmartSecretKey') && this.bitmartSecretKey) {
        this.bitmartSecretKey = encrypt(this.bitmartSecretKey);
    }
    if (this.isModified('bitmartApiMemo') && this.bitmartApiMemo) {
        this.bitmartApiMemo = encrypt(this.bitmartApiMemo);
    }
    next();
});

// Métodos para desencriptar las API keys al recuperarlas (no se guarda en la DB desencriptado)
UserSchema.methods.getDecryptedBitmartCredentials = function () {
    return {
        apiKey: this.bitmartApiKey ? decrypt(this.bitmartApiKey) : null,
        secretKey: this.bitmartSecretKey ? decrypt(this.bitmartSecretKey) : null,
        apiMemo: this.bitmartApiMemo ? decrypt(this.bitmartApiMemo) : null,
    };
};

const User = mongoose.model('User', UserSchema);

module.exports = User;