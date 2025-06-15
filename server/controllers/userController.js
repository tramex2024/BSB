// backend/controllers/userController.js

const User = require('../models/User');
const BotState = require('../models/BotState');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bitmartService = require('../services/bitmartService');

// --- Middleware de Autenticación ---
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

const getEncryptionKey = () => {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
        console.error("ERROR: ENCRYPTION_KEY is not defined in environment variables!");
        throw new Error("ENCRYPTION_KEY is not defined.");
    }
    // FIX: Directly return the 32-byte Buffer from SHA256 hash.
    // SHA256 always produces a 32-byte (256-bit) hash.
    const derivedKeyBuffer = crypto.createHash('sha256').update(key).digest(); 
    console.log(`[DEBUG_ENCRYPTION_KEY] Derived key (Buffer, hex partial): ${derivedKeyBuffer.toString('hex').substring(0, 10)}...${derivedKeyBuffer.toString('hex').substring(derivedKeyBuffer.toString('hex').length - 10)} (Length: ${derivedKeyBuffer.length} bytes)`);
    return derivedKeyBuffer; // This is now guaranteed to be a 32-byte Buffer
};

const getEncryptionIv = () => {
    const iv = process.env.ENCRYPTION_IV;
    if (!iv) {
        console.error("ERROR: ENCRYPTION_IV is not defined in environment variables!");
        throw new Error("ENCRYPTION_IV is not defined. Please set it to a 16-byte hex string.");
    }
    // Convert the IV from hex to Buffer. A 32-char hex string represents a 16-byte IV.
    console.log(`[DEBUG_ENCRYPTION_IV] IV (hex, partial): ${iv.substring(0, 5)}...${iv.substring(iv.length - 5)} (Length: ${iv.length})`);
    return Buffer.from(iv, 'hex'); // This will correctly produce a 16-byte Buffer if iv.length is 32
};

const encrypt = (text) => {
    try {
        const key = getEncryptionKey(); // This now returns the 32-byte Buffer directly
        const iv = getEncryptionIv();   // This returns the 16-byte Buffer (from hex string)

        const cipher = crypto.createCipheriv(algorithm, key, iv);
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
        const key = getEncryptionKey(); // This now returns the 32-byte Buffer directly
        const iv = getEncryptionIv();   // This returns the 16-byte Buffer (from hex string)

        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        console.error("Decryption failed:", error);
        console.error(`Attempting to decrypt: '${encryptedText}'`);
        throw new Error("Error interno del servidor al obtener y desencriptar credenciales de BitMart.");
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
        user.bitmartApiMemo = encrypt(memo || ''); // Encrypt empty string if memo is not provided

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
        if (!user || !user.bitmartApiKey || !user.bitmartSecretKeyEncrypted) {
            console.warn(`[BALANCE] User ${userId} tried to fetch balance but has no API keys.`);
            return res.status(400).json({ message: 'BitMart API keys not configured for this user.' });
        }

        const decryptedApiKey = decrypt(user.bitmartApiKey);
        const decryptedSecretKey = decrypt(user.bitmartSecretKeyEncrypted);
        const decryptedMemo = (user.bitmartApiMemo === undefined || user.bitmartApiMemo === null) ? '' : decrypt(user.bitmartApiMemo);

        const authCredentials = {
            apiKey: decryptedApiKey,
            secretKey: decryptedSecretKey,
            apiMemo: decryptedMemo
        };

        const balances = await bitmartService.getBalance(authCredentials);
        res.status(200).json(balances);

    } catch (error) {
        console.error('Error getting BitMart balance:', error);
        res.status(500).json({ message: error.message || 'Error fetching BitMart balance.' });
    }
};

// --- Controlador para obtener órdenes abiertas de BitMart ---
exports.getBitmartOpenOrders = async (req, res) => {
    const userId = req.user.id;
    const { symbol } = req.query;

    try {
        const user = await User.findById(userId);
        if (!user || !user.bitmartApiKey || !user.bitmartSecretKeyEncrypted) {
            console.warn(`[OPEN ORDERS] User ${userId} tried to fetch open orders but has no API keys.`);
            return res.status(400).json({ message: 'BitMart API keys not configured for this user.' });
        }

        const decryptedApiKey = decrypt(user.bitmartApiKey);
        const decryptedSecretKey = decrypt(user.bitmartSecretKeyEncrypted);
        const decryptedMemo = (user.bitmartApiMemo === undefined || user.bitmartApiMemo === null) ? '' : decrypt(user.bitmartApiMemo);

        const authCredentials = {
            apiKey: decryptedApiKey,
            secretKey: decryptedSecretKey,
            apiMemo: decryptedMemo
        };

        const openOrders = await bitmartService.getOpenOrders(authCredentials, symbol);
        res.status(200).json(openOrders);

    } catch (error) {
        console.error('Error getting BitMart open orders:', error);
        res.status(500).json({ message: error.message || 'Error fetching BitMart open orders.' });
    }
};

// --- Controlador para obtener el historial de órdenes (si ya lo tienes en bitmartService) ---
exports.getBitmartHistoryOrders = async (req, res) => {
    const userId = req.user.id;
    const { symbol, status } = req.query;

    try {
        const user = await User.findById(userId);
        if (!user || !user.bitmartApiKey || !user.bitmartSecretKeyEncrypted) {
            return res.status(400).json({ message: 'BitMart API keys not configured for this user.' });
        }

        const decryptedApiKey = decrypt(user.bitmartApiKey);
        const decryptedSecretKey = decrypt(user.bitmartSecretKeyEncrypted);
        const decryptedMemo = (user.bitmartApiMemo === undefined || user.bitmartApiMemo === null) ? '' : decrypt(user.bitmartApiMemo);

        const authCredentials = {
            apiKey: decryptedApiKey,
            secretKey: decryptedSecretKey,
            apiMemo: decryptedMemo
        };

        const historyOrders = await bitmartService.getHistoryOrdersV4(authCredentials, { symbol, status });
        res.status(200).json(historyOrders);

    } catch (error) {
        console.error('Error getting BitMart history orders:', error);
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

// --- Exportar las funciones de encriptación/desencriptación ---
// Esto permite que otros módulos, como tu middleware de autenticación, las utilicen.
module.exports.encrypt = encrypt;
module.exports.decrypt = decrypt;
