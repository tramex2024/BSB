// backend/controllers/userController.js

const User = require('../models/User'); // Asegúrate de que la ruta a tu modelo User sea correcta
const BotState = require('../models/BotState'); // ¡IMPORTANTE: Importar el modelo BotState!
const jwt = require('jsonwebtoken'); // Para verificar el token JWT
const crypto = require('crypto'); // Para encriptar/desencriptar las claves
const bitmartService = require('../services/bitmartService'); // Tu servicio para interactuar con BitMart

// --- MUY TEMPRANO: Logs de Depuración de Variables de Entorno (raw) ---
// Estas líneas se ejecutarán tan pronto como el archivo sea requerido por server.js
console.log(`[VERY EARLY DEBUG] ENCRYPTION_KEY_ENV (raw from process.env): '${process.env.ENCRYPTION_KEY}'`);
console.log(`[VERY EARLY DEBUG] ENCRYPTION_IV_ENV (raw from process.env): '${process.env.ENCRYPTION_IV}'`);

// --- Middleware de Autenticación (para asegurar que el usuario esté logueado) ---
exports.authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
        console.warn("[AUTH MIDDLEWARE] No token provided.");
        return res.status(401).json({ message: 'Authentication token required.' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            console.error("[AUTH MIDDLEWARE] JWT Verification Error:", err.message);
            return res.status(403).json({ message: 'Invalid or expired authentication token.' });
        }
        req.user = user;
        next();
    });
};

// --- Funciones de Ayuda para Encriptación/Desencriptación ---
const algorithm = 'aes-256-cbc';

// Modificado para devolver un Buffer de 32 bytes (64 caracteres hex) directamente
const getEncryptionKey = () => {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
        console.error("ERROR: ENCRYPTION_KEY is not defined in environment variables!");
        throw new Error("ENCRYPTION_KEY is not defined.");
    }
    // Derivar la clave a un hash SHA256 y tomar los primeros 32 bytes como Buffer
    const derivedKeyBuffer = crypto.createHash('sha256').update(key, 'utf8').digest().slice(0, 32);
    
    // --- NUEVO LOG DE DEPURACIÓN EN PROFUNDIDAD ---
    console.log(`[DEBUG KEY BUFFER] Derived ENCRYPTION_KEY Buffer (hex representation): '${derivedKeyBuffer.toString('hex')}' (Length: ${derivedKeyBuffer.length} bytes)`);
    
    if (derivedKeyBuffer.length !== 32) {
        console.error(`[CRITICAL ERROR] Derived ENCRYPTION_KEY Buffer NO es de 32 bytes. Longitud real: ${derivedKeyBuffer.length}.`);
        throw new Error(`Invalid encryption key: La clave derivada debe ser de 32 bytes.`);
    }
    return derivedKeyBuffer;
};

// Modificado para devolver un Buffer de 16 bytes (32 caracteres hex) directamente
const getEncryptionIv = () => {
    const iv = process.env.ENCRYPTION_IV;
    if (!iv) {
        console.error("ERROR: ENCRYPTION_IV is not defined in environment variables!");
        throw new Error("ENCRYPTION_IV is not defined. Please set it to a 16-byte hex string (32 hex characters).");
    }
    try {
        const ivBuffer = Buffer.from(iv, 'hex');
        // --- NUEVO LOG DE DEPURACIÓN EN PROFUNDIDAD ---
        console.log(`[DEBUG IV BUFFER] ENCRYPTION_IV Buffer (hex representation): '${ivBuffer.toString('hex')}' (Length: ${ivBuffer.length} bytes)`);

        if (ivBuffer.length !== 16) {
            console.error(`[CRITICAL ERROR] ENCRYPTION_IV del entorno NO es de 16 bytes. Longitud real (bytes): ${ivBuffer.length}. IV (raw): '${iv}'`);
            throw new Error(`Invalid initialization vector: IV debe ser de 16 bytes (32 caracteres hexadecimales).`);
        }
        return ivBuffer;
    } catch (e) {
        console.error(`[CRITICAL ERROR] Falló la conversión de ENCRYPTION_IV a Buffer. ¿Es un string hexadecimal válido? IV (raw): '${iv}'. Error: ${e.message}`);
        throw new Error(`Invalid initialization vector: Error al procesar IV.`);
    }
};

const encrypt = (text) => {
    try {
        const keyBuffer = getEncryptionKey(); // Ahora directamente retorna un Buffer
        const iv = getEncryptionIv();        // Ahora directamente retorna un Buffer

        const cipher = crypto.createCipheriv(algorithm, keyBuffer, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
    } catch (error) {
        console.error("Encryption failed:", error);
        throw new Error("Failed to encrypt data.");
    }
};

const decrypt = (encryptedText) => {
    try {
        const keyBuffer = getEncryptionKey(); // Ahora directamente retorna un Buffer
        const iv = getEncryptionIv();        // Ahora directamente retorna un Buffer

        const decipher = crypto.createDecipheriv(algorithm, keyBuffer, iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        console.error("Decryption failed:", error);
        console.error(`Attempting to decrypt: '${encryptedText}'`); // Log the problematic encrypted text
        // NO cambiar el mensaje de error para el frontend aquí, ya lo hace el catch de abajo
        throw new Error("Failed to decrypt BitMart credentials with current keys."); // Mensaje más específico para debug
    }
};


// --- Controlador para guardar las API Keys de BitMart ---
exports.saveBitmartApiKeys = async (req, res) => {
    const { apiKey, secretKey, memo } = req.body;

    try {
        if (!apiKey || !secretKey) {
            return res.status(400).json({ message: 'API Key and Secret Key are required.' });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        user.bitmartApiKey = encrypt(apiKey);
        user.bitmartSecretKeyEncrypted = encrypt(secretKey); // Usar el nombre que aparece en tu DB
        user.bitmartApiMemo = encrypt(memo || ''); // Usar el nombre que aparece en tu DB, y asegurar que siempre sea string

        user.bitmartApiValidated = false;
        await user.save();

        res.status(200).json({ message: 'BitMart API keys saved successfully. Please try to connect to validate them.', connected: true });

    } catch (error) {
        console.error('Error saving BitMart API keys:', error);
        if (error.message.includes("Failed to encrypt data")) {
            return res.status(500).json({ message: "Error encrypting API keys. Ensure ENCRYPTION_KEY and ENCRYPTION_IV are correctly set in your environment variables." });
        }
        res.status(500).json({ message: 'Error saving BitMart API keys. Please check server logs.' });
    }
};

// --- Controlador para obtener el balance de BitMart ---
exports.getBitmartBalance = async (req, res) => {
    const userId = req.user.id;

    try {
        const user = await User.findById(userId);
        if (!user || !user.bitmartApiKey || !user.bitmartSecretKeyEncrypted) { // Usar el nombre que aparece en tu DB
            console.warn(`[BALANCE] User ${userId} tried to fetch balance but has no API keys.`);
            return res.status(400).json({ message: 'BitMart API keys not configured for this user.' });
        }

        const decryptedApiKey = decrypt(user.bitmartApiKey);
        const decryptedSecretKey = decrypt(user.bitmartSecretKeyEncrypted); // Usar el nombre que aparece en tu DB
        const decryptedMemo = (user.bitmartApiMemo === undefined || user.bitmartApiMemo === null) ? '' : decrypt(user.bitmartApiMemo); // Usar el nombre que aparece en tu DB

        // --- NUEVOS LOGS DE DEPURACIÓN DE DESENCRIPTACIÓN ---
        console.log(`[DEBUG DECRYPT] Decrypted API Key (partial): ${decryptedApiKey.substring(0, 5)}...${decryptedApiKey.substring(decryptedApiKey.length - 5)} (Length: ${decryptedApiKey.length})`);
        console.log(`[DEBUG DECRYPT] Decrypted Secret Key (partial): ${decryptedSecretKey.substring(0, 5)}...${decryptedSecretKey.substring(decryptedSecretKey.length - 5)} (Length: ${decryptedSecretKey.length})`);
        console.log(`[DEBUG DECRYPT] Decrypted Memo: '${decryptedMemo}' (Length: ${decryptedMemo.length})`);
        // --- FIN NUEVOS LOGS ---

        const authCredentials = {
            apiKey: decryptedApiKey,
            secretKey: decryptedSecretKey,
            apiMemo: decryptedMemo
        };

        const balances = await bitmartService.getBalance(authCredentials);
        res.status(200).json(balances);

    } catch (error) {
        console.error('Error getting BitMart balance:', error);
        // Mensaje de error general para el frontend si la desencriptación falló
        if (error.message.includes("Failed to decrypt BitMart credentials")) {
             return res.status(500).json({ message: 'Error interno del servidor al obtener y desencriptar credenciales de BitMart. Por favor, verifica tus claves de encriptación en Render y vuelve a introducir tus API Keys en la aplicación.' });
        }
        res.status(500).json({ message: error.message || 'Error fetching BitMart balance.' });
    }
};

// --- Controlador para obtener órdenes abiertas de BitMart ---
exports.getBitmartOpenOrders = async (req, res) => {
    const userId = req.user.id;
    const { symbol } = req.query;

    try {
        const user = await User.findById(userId);
        if (!user || !user.bitmartApiKey || !user.bitmartSecretKeyEncrypted) { // Usar el nombre que aparece en tu DB
            console.warn(`[OPEN ORDERS] User ${userId} tried to fetch open orders but has no API keys.`);
            return res.status(400).json({ message: 'BitMart API keys not configured for this user.' });
        }

        const decryptedApiKey = decrypt(user.bitmartApiKey);
        const decryptedSecretKey = decrypt(user.bitmartSecretKeyEncrypted); // Usar el nombre que aparece en tu DB
        const decryptedMemo = (user.bitmartApiMemo === undefined || user.bitmartApiMemo === null) ? '' : decrypt(user.bitmartApiMemo); // Usar el nombre que aparece en tu DB

        const authCredentials = {
            apiKey: decryptedApiKey,
            secretKey: decryptedSecretKey,
            apiMemo: decryptedMemo
        };

        const openOrders = await bitmartService.getOpenOrders(authCredentials, symbol);
        res.status(200).json(openOrders);

    } catch (error) {
        console.error('Error getting BitMart open orders:', error);
        if (error.message.includes("Failed to decrypt BitMart credentials")) {
             return res.status(500).json({ message: 'Error interno del servidor al obtener y desencriptar credenciales de BitMart. Por favor, verifica tus claves de encriptación en Render y vuelve a introducir tus API Keys en la aplicación.' });
        }
        res.status(500).json({ message: error.message || 'Error fetching BitMart open orders.' });
    }
};

// --- Controlador para obtener el historial de órdenes (si ya lo tienes en bitmartService) ---
exports.getBitmartHistoryOrders = async (req, res) => {
    const userId = req.user.id;
    const { symbol, status } = req.query;

    try {
        const user = await User.findById(userId);
        if (!user || !user.bitmartApiKey || !user.bitmartSecretKeyEncrypted) { // Usar el nombre que aparece en tu DB
            return res.status(400).json({ message: 'BitMart API keys not configured for this user.' });
        }

        const decryptedApiKey = decrypt(user.bitmartApiKey);
        const decryptedSecretKey = decrypt(user.bitmartSecretKeyEncrypted); // Usar el nombre que aparece en tu DB
        const decryptedMemo = (user.bitmartApiMemo === undefined || user.bitmartApiMemo === null) ? '' : decrypt(user.bitmartApiMemo); // Usar el nombre que aparece en tu DB

        const authCredentials = {
            apiKey: decryptedApiKey,
            secretKey: decryptedSecretKey,
            apiMemo: decryptedMemo
        };

        // Asumiendo que bitmartService.getHistoryOrdersV4 ya existe
        const historyOrders = await bitmartService.getHistoryOrdersV4(authCredentials, { symbol, status });
        res.status(200).json(historyOrders);

    } catch (error) {
        console.error('Error getting BitMart history orders:', error);
         if (error.message.includes("Failed to decrypt BitMart credentials")) {
             return res.status(500).json({ message: 'Error interno del servidor al obtener y desencriptar credenciales de BitMart. Por favor, verifica tus claves de encriptación en Render y vuelve a introducir tus API Keys en la aplicación.' });
        }
        res.status(500).json({ message: error.message || 'Error fetching BitMart history orders.' });
    }
};

// --- Función Controladora: Obtener Configuración y Estado del Bot ---
// Asegúrate de importar el modelo BotState al principio de este archivo
exports.getBotConfigAndState = async (req, res) => {
    const userId = req.user.id;

    try {
        const botState = await BotState.findOne({ userId });

        if (!botState) {
            console.log(`[getBotConfigAndState] No se encontró estado de bot para el usuario ${userId}. Devolviendo valores predeterminados.`);
            return res.status(200).json({
                isRunning: false,
                state: 'STOPPED',
                cycle: 0,
                profit: 0.00,
                cycleProfit: 0.00,
                purchase: 5.00,
                increment: 100,
                decrement: 1.0,
                trigger: 1.5,
                stopAtCycleEnd: false
            });
        }

        console.log(`[getBotConfigAndState] Estado de bot encontrado para el usuario ${userId}.`);
        res.status(200).json(botState);

    } catch (error) {
        console.error('Error al obtener la configuración y estado del bot:', error);
        res.status(500).json({ message: 'Error interno del servidor al obtener la configuración y estado del bot.' });
    }
};
