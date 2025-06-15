// backend/controllers/userController.js

const User = require('../models/User'); // Asegúrate de que la ruta a tu modelo User sea correcta
const BotState = require('../models/BotState'); // ¡IMPORTANTE: Importar el modelo BotState!
const jwt = require('jsonwebtoken'); // Para verificar el token JWT
const crypto = require('crypto'); // Para encriptar/desencriptar las claves
const bitmartService = require('../services/bitmartService'); // Tu servicio para interactuar con BitMart

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

const getEncryptionKey = () => {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
        console.error("ERROR: ENCRYPTION_KEY is not defined in environment variables!");
        throw new Error("ENCRYPTION_KEY is not defined.");
    }
    return crypto.createHash('sha256').update(key).digest('base64').substring(0, 32);
};

const getEncryptionIv = () => {
    const iv = process.env.ENCRYPTION_IV;
    if (!iv) {
        console.error("ERROR: ENCRYPTION_IV is not defined in environment variables!");
        throw new Error("ENCRYPTION_IV is not defined. Please set it to a 16-byte hex string.");
    }
    return Buffer.from(iv, 'hex');
};

const encrypt = (text) => {
    try {
        const key = Buffer.from(getEncryptionKey(), 'utf8');
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

const decrypt = (encryptedText) => {
    try {
        const key = Buffer.from(getEncryptionKey(), 'utf8');
        const iv = getEncryptionIv();

        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        console.error("Decryption failed:", error);
        throw new Error("Failed to decrypt data. Check ENCRYPTION_KEY/IV consistency.");
    }
};


// --- Controlador para guardar las API Keys de BitMart ---
exports.saveBitmartApiKeys = async (req, res) => {
    const { apiKey, secretKey, memo } = req.body;
    const userId = req.user.id;

    try {
        if (!apiKey || !secretKey) {
            return res.status(400).json({ message: 'API Key and Secret Key are required.' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        user.bitmartApiKey = encrypt(apiKey);
        user.bitmartSecretKeyEncrypted = encrypt(secretKey);
        // MODIFICACIÓN CLAVE: Si 'memo' es una cadena vacía, guarda una cadena vacía en lugar de null.
        // Esto permite guardar explícitamente un memo vacío en lugar de dejar el campo como null.
        user.bitmartApiMemo = memo === '' ? '' : encrypt(memo);

        user.bitmartApiValidated = false;
        await user.save();

        // Se envía 'connected: true' para que el frontend pueda actualizar el indicador.
        res.status(200).json({ message: 'BitMart API keys saved successfully. Please try to connect to validate them.', connected: true });

    } catch (error) {
        console.error('Error saving BitMart API keys:', error);
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
        // Al desencriptar, si 'bitmartApiMemo' es una cadena vacía, se usa tal cual.
        // Si está encriptado, se desencripta. Si es null, sigue siendo null.
        const decryptedMemo = user.bitmartApiMemo === '' ? '' : (user.bitmartApiMemo ? decrypt(user.bitmartApiMemo) : null);

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
        const decryptedMemo = user.bitmartApiMemo === '' ? '' : (user.bitmartApiMemo ? decrypt(user.bitmartApiMemo) : null);

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
        const decryptedMemo = user.bitmartApiMemo === '' ? '' : (user.bitmartApiMemo ? decrypt(user.bitmartApiMemo) : null);

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

// --- NUEVA FUNCIÓN CONTROLADORA: Obtener Configuración y Estado del Bot ---
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
