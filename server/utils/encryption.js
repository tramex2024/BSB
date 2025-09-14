// server/utils/encryption.js
const crypto = require('crypto');
require('dotenv').config();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // ¡Tu clave generada de 64 caracteres hex!
const IV_LENGTH = 16; // Para AES-256-CBC, el IV es de 16 bytes

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
    console.error('❌ ERROR: ENCRYPTION_KEY no está definida o no tiene 64 caracteres hexadecimales en .env');
    console.error('Por favor, genera una clave segura (e.g., node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))")');
    process.exit(1); // Detiene la aplicación si la clave no es segura
}

const ENCRYPTION_ALGORITHM = 'aes-256-cbc'; // Algoritmo de encriptación

function encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH); // Genera un IV único para cada encriptación
    const cipher = crypto.createCipheriv(
        ENCRYPTION_ALGORITHM,
        Buffer.from(ENCRYPTION_KEY, 'hex'), // La clave debe ser un Buffer
        iv
    );
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted; // Combina IV y texto encriptado
}

function decrypt(text) {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(
        ENCRYPTION_ALGORITHM,
        Buffer.from(ENCRYPTION_KEY, 'hex'),
        iv
    );
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

module.exports = {
    encrypt,
    decrypt,
};