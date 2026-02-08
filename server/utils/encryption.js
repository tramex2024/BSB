/**
 * BSB/server/utils/encryption.js
 * UTILIDAD DE CIFRADO AES-256-CBC
 */

const crypto = require('crypto');
const algorithm = 'aes-256-cbc';

/**
 * Deriva la clave de 32 bytes. 
 * Se usa un hash para garantizar la longitud sin importar el tamaño del string en el .env
 */
const getEncryptionKey = () => {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) throw new Error("ENCRYPTION_KEY no definida en el entorno.");
    return crypto.createHash('sha256').update(key).digest(); 
};

/**
 * Obtiene el IV de 16 bytes.
 */
const getEncryptionIv = () => {
    const iv = process.env.ENCRYPTION_IV;
    if (!iv) throw new Error("ENCRYPTION_IV no definida.");
    
    const ivBuffer = Buffer.from(iv, 'hex');
    if (ivBuffer.length !== 16) {
        throw new Error("ENCRYPTION_IV debe ser un hex de 16 bytes (32 caracteres).");
    }
    return ivBuffer;
};

/**
 * Encripta texto plano a Hexadecimal
 */
exports.encrypt = (text) => {
    if (!text) return '';
    try {
        const key = getEncryptionKey();
        const iv = getEncryptionIv();
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
    } catch (error) {
        console.error("❌ Error en Encriptación:", error.message);
        throw new Error("Fallo al cifrar datos sensibles.");
    }
};

/**
 * Desencripta Hexadecimal a texto plano
 */
exports.decrypt = (encryptedText) => {
    if (!encryptedText) return '';
    try {
        const key = getEncryptionKey();
        const iv = getEncryptionIv();
        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        // No logueamos el texto encriptado en producción por seguridad
        console.error("❌ Error en Desencriptación: Posible llave/IV incorrectos o datos corruptos.");
        throw new Error("Error al descifrar credenciales.");
    }
};