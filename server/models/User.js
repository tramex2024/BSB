// backend/models/User.js
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
    // Si tu aplicación va a tener contraseñas normales (además del login con token), las definirías aquí.
    // Por ahora, si solo usas login con token, este campo podría no ser necesario si no lo tienes en tu código.
    // password: {
    //     type: String,
    //     required: function() { return this.isNew || this.password; } // Required solo si es nuevo o se está estableciendo
    // },
    
    // Campos para el token de autenticación de un solo uso (para login sin contraseña)
    // Estos campos NO deben ser required: true, ya que se anulan después de la verificación.
    token: { // Este es el campo que causaba el error 'token: Path `token` is required.'
        type: String
        // NOTA: 'required: true' ha sido eliminado de aquí.
    },
    tokenExpires: { // Este es el campo que causaba el error 'tokenExpires: Path `tokenExpires` is required.'
        type: Date
        // NOTA: 'required: true' ha sido eliminado de aquí.
    },

    // Campos para las API Keys de BitMart
    bitmartApiKey: {
        type: String,
        // No es required para que un usuario pueda existir sin API keys configuradas
    },
    // ¡CORRECCIÓN CRÍTICA AQUÍ! El nombre del campo debe coincidir con 'bitmartSecretKeyEncrypted'
    bitmartSecretKeyEncrypted: { 
        type: String,
        // No es required por la misma razón
    },
    bitmartApiMemo: {
        type: String,
        // No es required
    },
    // Puedes añadir un campo para saber si las claves de BitMart están validadas
    bitmartApiValidated: {
        type: Boolean,
        default: false
    }

}, { timestamps: true }); // 'timestamps: true' añade createdAt y updatedAt automáticamente

// Si tu esquema maneja contraseñas, aquí iría el pre-save hook para encriptarlas.
// userSchema.pre('save', async function(next) {
//     if (!this.isModified('password')) return next();
//     this.password = await bcrypt.hash(this.password, 10);
//     next();
// });

// Si tu esquema maneja la comparación de contraseñas
// userSchema.methods.comparePassword = async function(candidatePassword) {
//     return await bcrypt.compare(candidatePassword, this.password);
// };

module.exports = mongoose.model('User', userSchema);