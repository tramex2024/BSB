// server/controllers/userController.js

const User = require('../models/User'); // Asegúrate de que la ruta a tu modelo User sea correcta
const BotState = require('../models/BotState'); // ¡IMPORTANTE: Importar el modelo BotState!
const jwt = require('jsonwebtoken'); // Para verificar el token JWT

const { encrypt, decrypt } = require('../utils/encryption'); // Necesitas 'decrypt' también para las credenciales
const bitmartService = require('../services/bitmartService'); // Tu servicio para interactuar con BitMart

// IMPORTAR EL AUTOBOT LOGIC
const autobotLogic = require('../autobotLogic'); // <--- AÑADE ESTA LÍNEA


// --- MUY TEMPRANO: Logs de Depuración de Variables de Entorno (raw) ---
// Estas líneas se ejecutarán tan pronto como el archivo sea requerido por server.js
// Estos logs son solo informativos y no afectan la lógica de encriptación que ahora está centralizada en utils/encryption.js
console.log(`[VERY EARLY DEBUG] ENCRYPTION_KEY_ENV (raw from process.env): '${process.env.ENCRYPTION_KEY ? process.env.ENCRYPTION_KEY.substring(0, 5) + '...' : 'UNDEFINED'}'`);
console.log(`[VERY EARLY DEBUG] JWT_SECRET_ENV (raw from process.env): '${process.env.JWT_SECRET ? process.env.JWT_SECRET.substring(0, 5) + '...' : 'UNDEFINED'}'`);


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


// --- Controlador para guardar las API Keys de BitMart ---
exports.saveBitmartApiKeys = async (req, res) => {
    const { apiKey, secretKey, apiMemo } = req.body;

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
        user.bitmartApiMemo = encrypt(apiMemo || '');

        user.bitmartApiValidated = false;
        await user.save();

        res.status(200).json({ message: 'BitMart API keys saved successfully. Please try to connect to validate them.', connected: true });

    } catch (error) {
        console.error('Error saving BitMart API keys:', error);
        if (error.message.includes("ENCRYPTION_KEY no está definida")) {
            return res.status(500).json({ message: "Error interno del servidor al encriptar las claves. Asegúrate de que ENCRYPTION_KEY esté correctamente definida en tus variables de entorno." });
        }
        res.status(500).json({ message: error.message || 'Error saving BitMart API keys. Please check server logs.' });
    }
};

// --- Controlador para obtener el balance de BitMart ---
exports.getBitmartBalance = async (req, res) => {
    const authCredentials = req.bitmartCreds;

    try {
        const balances = await bitmartService.getBalance(authCredentials);
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
    const { symbol } = req.query;

    const authCredentials = req.bitmartCreds;

    try {
        const openOrders = await bitmartService.getOpenOrders(authCredentials, symbol);
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
    const { symbol, orderMode, startTime, endTime, limit } = req.query;

    const authCredentials = req.bitmartCreds;

    try {
        const historyParams = {
            symbol,
            orderMode,
            startTime: startTime ? parseInt(startTime, 10) : undefined,
            endTime: endTime ? parseInt(endTime, 10) : undefined,
            limit: limit ? parseInt(limit, 10) : undefined
        };

        const historyOrders = await bitmartService.getHistoryOrdersV4(authCredentials, historyParams);

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

---

## Modificación de `toggleBotState` en `userController.js` 🚀

```javascript
// --- Función Controladora: Alternar el estado del Bot (Start/Stop) ---
exports.toggleBotState = async (req, res) => {
    const userId = req.user.id;
    const { action, params } = req.body; // `action` será 'start' o 'stop', `params` contendrá la configuración

    // Las credenciales de BitMart se obtienen del `bitmartAuthMiddleware`
    // y se adjuntan a `req.bitmartCreds`. Son necesarias para `autobotLogic.toggleBotState`.
    const bitmartCreds = req.bitmartCreds; 

    if (!bitmartCreds) {
        return res.status(400).json({ success: false, message: 'BitMart API keys not configured or invalid. Cannot toggle bot state.' });
    }

    try {
        // Llamar a la función `toggleBotState` de `autobotLogic`
        // Esta función ahora será la que realmente inicie o detenga el intervalo del bot.
        const updatedBotState = await autobotLogic.toggleBotState(userId, action, params, bitmartCreds);

        // Envía la respuesta al frontend con el estado actualizado del bot
        res.status(200).json({ success: true, message: `Bot state set to ${updatedBotState.state}.`, botState: updatedBotState });

    } catch (error) {
        console.error('Error toggling bot state:', error);
        // Emitir el error al cliente a través de Socket.IO si `ioInstance` está disponible en autobotLogic
        if (autobotLogic.ioInstance) { // Assuming ioInstance might be exposed or passed
            autobotLogic.ioInstance.to(userId).emit('botError', { message: error.message, userId: userId });
        }
        res.status(500).json({ success: false, message: error.message || 'Error internal server when trying to change bot state.' });
    }
};