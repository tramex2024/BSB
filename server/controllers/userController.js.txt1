// server/controllers/userController.js

const User = require('../models/User');
const BotState = require('../models/BotState');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bitmartService = require('../services/bitmartService');
const autobotLogic = require('../autobotLogic'); // !!! IMPORTANTE: Importar autobotLogic !!!

// --- MUY TEMPRANO: Logs de Depuración de Variables de Entorno (raw) ---
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
        const keyBuffer = getEncryptionKey();
        const iv = getEncryptionIv();

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
        const keyBuffer = getEncryptionKey();
        const iv = getEncryptionIv();

        const decipher = crypto.createDecipheriv(algorithm, keyBuffer, iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        console.error("Decryption failed:", error);
        console.error(`Attempting to decrypt: '${encryptedText}'`);
        throw new Error("Failed to decrypt BitMart credentials with current keys.");
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
        user.bitmartSecretKeyEncrypted = encrypt(secretKey);
        user.bitmartApiMemo = encrypt(memo || '');

        user.bitmartApiValidated = false; // Reset validation status on save
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
        // bitmartAuthMiddleware ya debería haber puesto req.bitmartCreds
        if (!req.bitmartCreds || !req.bitmartCreds.apiKey) {
            console.warn(`[BALANCE] User ${userId} tried to fetch balance but req.bitmartCreds is missing.`);
            return res.status(400).json({ message: 'BitMart API keys not configured or could not be decrypted.' });
        }

        const balances = await bitmartService.getBalance(req.bitmartCreds);
        res.status(200).json(balances);

    } catch (error) {
        console.error('Error getting BitMart balance:', error);
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
        // bitmartAuthMiddleware ya debería haber puesto req.bitmartCreds
        if (!req.bitmartCreds || !req.bitmartCreds.apiKey) {
            console.warn(`[OPEN ORDERS] User ${userId} tried to fetch open orders but req.bitmartCreds is missing.`);
            return res.status(400).json({ message: 'BitMart API keys not configured or could not be decrypted.' });
        }

        const openOrders = await bitmartService.getOpenOrders(req.bitmartCreds, symbol);
        res.status(200).json({ success: true, orders: openOrders });

    } catch (error) {
        console.error('Error getting BitMart open orders:', error);
        if (error.message.includes("Failed to decrypt BitMart credentials")) {
            return res.status(500).json({ message: 'Error interno del servidor al obtener y desencriptar credenciales de BitMart. Por favor, verifica tus claves de encriptación en Render y vuelve a introducir tus API Keys en la aplicación.' });
        }
        res.status(500).json({ message: error.message || 'Error fetching BitMart open orders.' });
    }
};

// --- Controlador para obtener el historial de órdenes (Ajustado para el frontend) ---
exports.getHistoryOrders = async (req, res) => {
    const userId = req.user.id;
    const { symbol, orderMode, startTime, endTime, limit } = req.query;

    try {
        // bitmartAuthMiddleware ya debería haber puesto req.bitmartCreds
        if (!req.bitmartCreds || !req.bitmartCreds.apiKey) {
            console.warn(`[HISTORY ORDERS] User ${userId} tried to fetch history orders but req.bitmartCreds is missing.`);
            return res.status(400).json({ message: 'BitMart API keys not configured or could not be decrypted.' });
        }

        const historyParams = {
            symbol,
            orderMode,
            startTime: startTime ? parseInt(startTime, 10) : undefined,
            endTime: endTime ? parseInt(endTime, 10) : undefined,
            limit: limit ? parseInt(limit, 10) : undefined
        };

        const historyOrders = await bitmartService.getHistoryOrdersV4(req.bitmartCreds, historyParams);

        res.status(200).json({ success: true, orders: historyOrders });

    } catch (error) {
        console.error('Error getting BitMart history orders:', error);
        if (error.message.includes("Failed to decrypt BitMart credentials")) {
            return res.status(500).json({ message: 'Error interno del servidor al obtener y desencriptar credenciales de BitMart. Por favor, verifica tus claves de encriptación en Render y vuelve a introducir tus API Keys en la aplicación.' });
        }
        res.status(500).json({ message: error.message || 'Error fetching BitMart history orders.' });
    }
};

// --- Función Controladora: Obtener Configuración y Estado del Bot ---
exports.getBotConfigAndState = async (req, res) => {
    const userId = req.user.id;

    try {
        const botState = await BotState.findOne({ userId });

        if (!botState) {
            console.log(`[getBotConfigAndState] No se encontró estado de bot para el usuario ${userId}. Devolviendo valores predeterminados.`);
            // Asegúrate de que estos valores predeterminados coincidan con los de tu modelo BotState
            // Ensure all numerical values are handled safely, either by being actual numbers or 0.
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
                stopAtCycleEnd: false,
                currentPrice: 0,
                ppc: 0,
                ac: 0,
                pm: 0,
                pv: 0,
                pc: 0,
                lastOrder: null,
                openOrders: []
            });
        }

        console.log(`[getBotConfigAndState] Estado de bot encontrado para el usuario ${userId}.`);
        res.status(200).json(botState);

    } catch (error) {
        console.error('Error al obtener la configuración y estado del bot:', error);
        res.status(500).json({ message: 'Error interno del servidor al obtener la configuración y estado del bot.' });
    }
};

// --- Función Controladora: Alternar el estado del Bot (Start/Stop) ---
exports.toggleBotState = async (req, res) => {
    const userId = req.user.id;
    const { action, params } = req.body; // `action` será 'start' o 'stop', `params` contendrá la configuración

    try {
        // Recuperar las credenciales de BitMart del middleware
        const bitmartCreds = req.bitmartCreds;

        if (!bitmartCreds || !bitmartCreds.apiKey) {
            console.error(`[toggleBotState] No se encontraron credenciales de BitMart en req.bitmartCreds para el usuario ${userId}.`);
            return res.status(400).json({ success: false, message: 'BitMart API keys not configured or could not be decrypted. Cannot toggle bot state.' });
        }

        // Delegar la lógica de inicio/parada al autobotLogic
        const updatedBotState = await autobotLogic.toggleBotState(userId, action, params, bitmartCreds);

        if (updatedBotState) {
            res.status(200).json({ success: true, message: `Bot state set to ${updatedBotState.state}.`, botState: updatedBotState });
        } else {
            // Esto debería ser manejado por autobotLogic, pero como fallback
            res.status(500).json({ success: false, message: 'Failed to update bot state. Check server logs.' });
        }

    } catch (error) {
        console.error('Error toggling bot state in controller:', error);
        // Mejorar el mensaje de error para el frontend
        if (error.message.includes("Failed to decrypt BitMart credentials")) {
            return res.status(500).json({ success: false, message: 'Error interno del servidor al obtener y desencriptar credenciales de BitMart. Por favor, verifica tus claves de encriptación en Render y vuelve a introducir tus API Keys en la aplicación.' });
        }
        // Specific handling for the 'toFixed' error
        if (error.message.includes("Cannot read properties of undefined (reading 'toFixed')")) {
            return res.status(500).json({ success: false, message: 'Error de cálculo: un valor numérico esencial es nulo o indefinido. Esto suele indicar un problema con los datos de mercado o un balance inesperado. Por favor, revisa tus logs de servidor para más detalles.' });
        }
        res.status(500).json({ success: false, message: error.message || 'Error interno del servidor al intentar cambiar el estado del bot.' });
    }
};


// --- Exportaciones Adicionales ---
module.exports.encrypt = encrypt;
module.exports.decrypt = decrypt;