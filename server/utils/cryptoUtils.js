// server/utils/cryptoUtils.js

const crypto = require('crypto');

const algorithm = 'aes-256-cbc';

/**
 * Deriva la clave de encriptación de la variable de entorno ENCRYPTION_KEY.
 * Asegura que la clave sea un Buffer de 32 bytes (256 bits) para AES-256-CBC.
 * @returns {Buffer} La clave de encriptación en formato Buffer.
 * @throws {Error} Si ENCRYPTION_KEY no está definida o la clave derivada no tiene la longitud correcta.
 */
const getEncryptionKey = () => {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
        console.error("ERROR: ENCRYPTION_KEY is not defined in environment variables!");
        throw new Error("ENCRYPTION_KEY is not defined.");
    }
    // SHA256 siempre produce un hash de 32 bytes (256 bits).
    const derivedKeyBuffer = crypto.createHash('sha256').update(key).digest(); 
    
    if (derivedKeyBuffer.length !== 32) {
        console.error(`[CRITICAL ERROR] ENCRYPTION_KEY derivada NO es de 32 bytes. Longitud real: ${derivedKeyBuffer.length} bytes.`);
        throw new Error(`Invalid encryption key: La clave derivada debe ser de 32 bytes.`);
    }
    console.log(`[DEBUG_ENCRYPTION_KEY] Derived key (Buffer, hex partial): ${derivedKeyBuffer.toString('hex').substring(0, 10)}...${derivedKeyBuffer.toString('hex').substring(derivedKeyBuffer.toString('hex').length - 10)} (Length: ${derivedKeyBuffer.length} bytes)`);
    return derivedKeyBuffer;
};

/**
 * Obtiene el Vector de Inicialización (IV) de la variable de entorno ENCRYPTION_IV.
 * Asegura que el IV sea un Buffer de 16 bytes (128 bits).
 * @returns {Buffer} El IV en formato Buffer.
 * @throws {Error} Si ENCRYPTION_IV no está definida o no tiene la longitud correcta.
 */
const getEncryptionIv = () => {
    const iv = process.env.ENCRYPTION_IV;
    if (!iv) {
        console.error("ERROR: ENCRYPTION_IV is not defined in environment variables!");
        throw new Error("ENCRYPTION_IV is not defined. Please set it to a 16-byte hex string (32 hex characters).");
    }
    try {
        const ivBuffer = Buffer.from(iv, 'hex');
        if (ivBuffer.length !== 16) {
            console.error(`[CRITICAL ERROR] ENCRYPTION_IV del entorno NO es de 16 bytes. Longitud real (bytes): ${ivBuffer.length}. IV (raw): '${iv}'`);
            throw new Error(`Invalid initialization vector: IV debe ser de 16 bytes (32 caracteres hexadecimales).`);
        }
        console.log(`[DEBUG_ENCRYPTION_IV] IV (hex, partial): ${iv.substring(0, 5)}...${iv.substring(iv.length - 5)} (Length: ${iv.length})`);
        return ivBuffer;
    } catch (e) {
        console.error(`[CRITICAL ERROR] Falló la conversión de ENCRYPTION_IV a Buffer. ¿Es un string hexadecimal válido? IV (raw): '${iv}'. Error: ${e.message}`);
        throw new Error(`Invalid initialization vector: Error al procesar IV.`);
    }
};

/**
 * Encripta una cadena de texto usando AES-256-CBC.
 * @param {string} text La cadena de texto a encriptar.
 * @returns {string} El texto encriptado en formato hexadecimal.
 * @throws {Error} Si la encriptación falla.
 */
const encrypt = (text) => {
    try {
        const key = getEncryptionKey();
        const iv = getEncryptionIv();

        const cipher = crypto.createCipheriv(algorithm, key, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
    } catch (error) {
        console.error("Encryption failed:", error);
        throw new Error("Failed to encrypt data.");
    }
};

/**
 * Desencripta una cadena de texto encriptada con AES-256-CBC.
 * @param {string} encryptedText El texto encriptado en formato hexadecimal.
 * @returns {string} El texto desencriptado.
 * @throws {Error} Si la desencriptación falla.
 */
const decrypt = (encryptedText) => {
    try {
        const key = getEncryptionKey();
        const iv = getEncryptionIv();

        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        console.error("Decryption failed:", error);
        console.error(`Attempting to decrypt: '${encryptedText}'`); // Log the problematic encrypted text
        throw new Error("Error interno del servidor al obtener y desencriptar credenciales."); 
    }
};

module.exports = {
    encrypt,
    decrypt,
    getEncryptionKey, // Exportar también por si se necesitan los buffers para depuración
    getEncryptionIv,
};
