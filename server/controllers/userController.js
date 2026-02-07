// server/controllers/userController.js

const User = require('../models/User');
const Autobot = require('../models/Autobot');
const jwt = require('jsonwebtoken');
const { encrypt } = require('../utils/encryption');
const bitmartService = require('../services/bitmartService');
const autobotLogic = require('../autobotLogic');

// --- Middleware de Autenticación Corregido ---
exports.authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Authentication token required.' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            console.error("[AUTH MIDDLEWARE] JWT Error:", err.message);
            return res.status(403).json({ message: 'Invalid or expired token.' });
        }
        // Asignamos el decoded (que contiene id, email, etc) al req.user
        req.user = decoded; 
        next();
    });
};

// --- Guardar API Keys (Estructura definitiva para Multi-tenant) ---
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

        // 1. Guardamos API Key plana (fácil de identificar)
        user.bitmartApiKey = apiKey;
        
        // 2. Encriptamos SOLO el secreto (máxima seguridad)
        user.bitmartSecretKeyEncrypted = encrypt(secretKey);
        
        // 3. Memo plano
        user.bitmartApiMemo = apiMemo || '';

        user.bitmartApiValidated = false;
        await user.save();

        console.log(`[USER-CONTROLLER] 🔑 Keys guardadas para el usuario: ${user.email}`);

        res.status(200).json({ 
            success: true,
            message: 'BitMart API keys saved successfully. Please validate them to start.', 
            connected: true 
        });

    } catch (error) {
        console.error('Error saving BitMart API keys:', error);
        res.status(500).json({ message: error.message || 'Error saving keys.' });
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

// --- Función Controladora: Alternar el estado del Bot (Start/Stop) ---
exports.toggleBotState = async (req, res) => {
    const userId = req.user.id;
    const { action, params } = req.body;

    const bitmartCreds = req.bitmartCreds;

    if (!bitmartCreds) {
        return res.status(400).json({ success: false, message: 'BitMart API keys not configured or invalid. Cannot toggle bot state.' });
    }

    try {
        const updatedBotState = await autobotLogic.toggleBotState(userId, action, params, bitmartCreds);

        res.status(200).json({ success: true, message: `Bot state set to ${updatedBotState.state}.`, botState: updatedBotState });

    } catch (error) {
        console.error('Error toggling bot state:', error);
        if (autobotLogic.ioInstance) {
            autobotLogic.ioInstance.to(userId).emit('botError', { message: error.message, userId: userId });
        }
        res.status(500).json({ success: false, message: error.message || 'Error internal server when trying to change bot state.' });
    }
};

// --- Controlador para obtener el precio de un ticker (ej. BTC_USDT) ---
exports.getTickerPrice = async (req, res) => {
    // El símbolo se pasa como parámetro en la URL, ej: /api/user/bitmart/ticker?symbol=BTC_USDT
    const { symbol } = req.query; 

    // Verificamos que se haya pasado un símbolo
    if (!symbol) {
        return res.status(400).json({ message: 'El parámetro "symbol" es requerido.' });
    }

    try {
        // Llamamos a la función getTicker de bitmartService con el símbolo proporcionado.
        const tickerData = await bitmartService.getTicker(symbol);
        
        // Devolvemos solo el precio, si existe.
        if (tickerData && tickerData.last_price) {
            const lastPrice = parseFloat(tickerData.last_price);
            res.status(200).json({ price: lastPrice });
        } else {
            res.status(404).json({ message: 'Datos del ticker no encontrados.' });
        }
    } catch (error) {
        console.error(`Error fetching ticker data for ${symbol}:`, error.message);
        res.status(500).json({ message: 'Error fetching ticker data from BitMart.', error: error.message });
    }
};

// --- NUEVA FUNCIÓN CONTROLADORA: Actualizar Configuración del Bot ---
exports.updateBotConfig = async (req, res) => {
    const userId = req.user.id;
    const { config } = req.body;

    if (!config) {
        return res.status(400).json({ success: false, message: 'Configuration data is missing.' });
    }

    try {
        // Busca el documento del bot para el usuario, o crea uno nuevo si no existe.
        let bot = await Autobot.findOne({ userId });

        if (!bot) {
            bot = new Autobot({ 
                userId,
                config: config,
                // Al crear, el balance inicial es el amount total
                lbalance: config.long.amountUsdt || 0 
            });
        } else {
            // Actualiza la configuración
            bot.config = config;
            // Si el bot está detenido, resetea el lbalance al nuevo amount
            if (bot.lstate === 'STOPPED') {
                bot.lbalance = config.long.amountUsdt || bot.lbalance;
            }
        }

        await bot.save();
        
        // Opcional: Emitir actualización por WebSocket si es necesario
        // if (autobotLogic.ioInstance) {
        //     autobotLogic.ioInstance.to(userId).emit('bot-state-update', bot.toObject());
        // }

        res.status(200).json({ success: true, message: 'Bot configuration updated successfully.' });

    } catch (error) {
        console.error('Error updating bot configuration:', error);
        res.status(500).json({ success: false, message: 'Error updating configuration on server.' });
    }
};