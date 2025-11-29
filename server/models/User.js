// server/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // Asumo que usas bcrypt para encriptar contraseñas si las manejas

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^[\w-]+(?:\.[\w-]+)*@(?:[\w-]+\.)+[a-zA-Z]{2,7}$/, 'Please fill a valid email address']
    },
    
    autobotId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Autobot', // Asegúrate de que 'Autobot' sea el nombre correcto de tu modelo de bot
        default: null // Puede ser null inicialmente si se asigna después del registro
    },

    jwtToken: {
        type: String,
        default: null,
    },
    
    // Campos para el token de autenticación de un solo uso (para login sin contraseña)
    // Estos campos NO deben ser required: true, ya que se anulan después de la verificación.
    token: { 
        type: String        
    },
    tokenExpires: { // Este es el campo que causaba el error 'tokenExpires: Path `tokenExpires` is required.'
        type: Date        
    },

    // Campos para las API Keys de BitMart
    bitmartApiKey: {
        type: String,
        // No es required para que un usuario pueda existir sin API keys configuradas
    },
    // ¡CORRECCIÓN CRÍTICA AQUÍ! El nombre del campo debe coincidir con 'bitmartSecretKeyEncrypted'
    bitmartSecretKeyEncrypted: { 
        type: String,        
    },
    bitmartApiMemo: {
        type: String,        
    },
    // Puedes añadir un campo para saber si las claves de BitMart están validadas
    bitmartApiValidated: {
        type: Boolean,
        default: false
    }

}, { timestamps: true }); // 'timestamps: true' añade createdAt y updatedAt automáticamente


module.exports = mongoose.model('User', userSchema);
