// server/controllers/userController.js

const User = require('../models/User');
const BotState = require('../models/BotState');
const jwt = require('jsonwebtoken');
// Ya no necesitamos 'crypto' directamente aquí para encriptación/desencriptación,
// ya que usaremos las funciones de utils/encryption.js
// const crypto = require('crypto'); // ELIMINADO
const bitmartService = require('../services/bitmartService');
const autobotLogic = require('../autobotLogic'); // !!! IMPORTANTE: Importar autobotLogic !!!

// --- IMPORTACIÓN CLAVE: Importar las funciones de encriptación/desencriptación correctas ---
const { encrypt, decrypt } = require('../utils/encryption'); // <--- ¡CAMBIADO Y AÑADIDO AQUÍ!

// --- MUY TEMPRANO: Logs de Depuración de Variables de Entorno (raw) ---
// Estos logs son solo para verificar que las variables de entorno se carguen.
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

// --- ELIMINADAS: Funciones de Ayuda para Encriptación/Desencriptación duplicadas e incorrectas ---
// const algorithm = 'aes-256-cbc';
// const getEncryptionKey = () => { ... };
// const getEncryptionIv = () => { ... };
// const encrypt = (text) => { ... };
// const decrypt = (encryptedText) => { ... };
// --- FIN ELIMINADAS ---


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

        // Ahora usamos las funciones 'encrypt' de 'utils/encryption.js'
        user.bitmartApiKey = encrypt(apiKey);
        user.bitmartSecretKeyEncrypted = encrypt(secretKey);
        // Asegúrate de que el memo se encripte, incluso si es una cadena vacía
        user.bitmartApiMemo = encrypt(memo || '');

        user.bitmartApiValidated = false; // Reset validation status on save
        await user.save();

        res.status(200).json({ message: 'BitMart API keys saved successfully. Please try to connect to validate them.', connected: true });

    } catch (error) {
        console.error('Error saving BitMart API keys:', error);
        if (error.message.includes("Failed to encrypt data.")) { // Mensaje de error de la función `encrypt` de utils
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
        if (error.message.includes("Failed to decrypt BitMart credentials with current keys.")) { // Mensaje de error de la función `decrypt` de utils
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
        if (error.message.includes("Failed to decrypt BitMart credentials with current keys.")) {
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
        if (error.message.includes("Failed to decrypt BitMart credentials with current keys.")) {
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
            res.status(500).json({ success: false, message: 'Failed to update bot state. Check server logs.' });
        }

    } catch (error) {
        console.error('Error toggling bot state in controller:', error);
        if (error.message.includes("Failed to decrypt BitMart credentials with current keys.")) {
            return res.status(500).json({ success: false, message: 'Error interno del servidor al obtener y desencriptar credenciales de BitMart. Por favor, verifica tus claves de encriptación en Render y vuelve a introducir tus API Keys en la aplicación.' });
        }
        if (error.message.includes("Cannot read properties of undefined (reading 'toFixed')")) {
            return res.status(500).json({ success: false, message: 'Error de cálculo: un valor numérico esencial es nulo o indefinido. Esto suele indicar un problema con los datos de mercado o un balance inesperado. Por favor, revisa tus logs de servidor para más detalles.' });
        }
        res.status(500).json({ success: false, message: error.message || 'Error interno del servidor al intentar cambiar el estado del bot.' });
    }
};


// --- Exportaciones Adicionales (ya no se exportan encrypt/decrypt desde aquí) ---
// module.exports.encrypt = encrypt; // ELIMINADO
// module.exports.decrypt = decrypt; // ELIMINADO