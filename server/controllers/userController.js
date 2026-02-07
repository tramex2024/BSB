// BSB/server/controllers/userController.js

const User = require('../models/User');
const Autobot = require('../models/Autobot');
const jwt = require('jsonwebtoken');
const { encrypt } = require('../utils/encryption');
const bitmartService = require('../services/bitmartService');
const autobotLogic = require('../autobotLogic');

// --- Middleware de Autenticación ---
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
        req.user = decoded; 
        next();
    });
};

// --- Guardar API Keys ---
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

        // Encriptamos los 3 campos para máxima seguridad
        user.bitmartApiKey = encrypt(apiKey); 
        user.bitmartSecretKeyEncrypted = encrypt(secretKey);
        user.bitmartApiMemo = encrypt(apiMemo || '');

        user.bitmartApiValidated = false;
        await user.save();

        console.log(`[USER-CONTROLLER] 🛡️ Credentials encrypted and saved for: ${user.email}`);

        res.status(200).json({ 
            success: true,
            message: 'BitMart keys saved successfully.', 
            connected: true 
        });

    } catch (error) {
        console.error('Error saving keys:', error);
        res.status(500).json({ message: 'Internal error encrypting keys.' });
    }
};

// --- Controlador: Balance ---
exports.getBitmartBalance = async (req, res) => {
    try {
        // Pasamos las credenciales descifradas del middleware al servicio
        const balances = await bitmartService.getBalance(req.bitmartCreds);
        res.status(200).json(balances);
    } catch (error) {
        console.error('Error getting BitMart balance:', error);
        res.status(500).json({ message: error.message || 'Error fetching BitMart balance.' });
    }
};

// --- Controlador: Órdenes Abiertas ---
exports.getBitmartOpenOrders = async (req, res) => {
    const { symbol } = req.query;
    try {
        // IMPORTANTE: Primero el símbolo, luego las credenciales según definimos en bitmartService.js
        const openOrders = await bitmartService.getOpenOrders(symbol || 'BTC_USDT', req.bitmartCreds);
        res.status(200).json({ success: true, orders: openOrders.orders });
    } catch (error) {
        console.error('Error getting BitMart open orders:', error);
        res.status(500).json({ message: error.message || 'Error fetching BitMart open orders.' });
    }
};

// --- Controlador: Historial de Órdenes ---
exports.getHistoryOrders = async (req, res) => {
    const { symbol, status, startTime, endTime, limit } = req.query;

    try {
        const historyParams = {
            symbol: symbol || 'BTC_USDT',
            status: status || 'all',
            startTime: startTime ? parseInt(startTime, 10) : undefined,
            endTime: endTime ? parseInt(endTime, 10) : undefined,
            limit: limit ? parseInt(limit, 10) : undefined
        };

        // Pasamos params y credenciales
        const historyOrders = await bitmartService.getHistoryOrders(historyParams, req.bitmartCreds);
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
        // Asegúrate de que el modelo se llame Autobot o BotState según tu archivo models/Autobot.js
        const botState = await Autobot.findOne({ userId });

        if (!botState) {
            return res.status(200).json({
                isRunning: false,
                state: 'STOPPED',
                lbalance: 0
            });
        }
        res.status(200).json(botState);
    } catch (error) {
        console.error('Error fetching bot config:', error);
        res.status(500).json({ message: 'Error fetching bot config.' });
    }
};

// --- Función Controladora: Alternar el estado del Bot (Start/Stop) ---
exports.toggleBotState = async (req, res) => {
    const userId = req.user.id;
    const { action, params } = req.body;

    if (!req.bitmartCreds) {
        return res.status(400).json({ success: false, message: 'BitMart API keys not configured.' });
    }

    try {
        const updatedBotState = await autobotLogic.toggleBotState(userId, action, params, req.bitmartCreds);
        res.status(200).json({ success: true, message: `Bot state set to ${updatedBotState.lstate}.`, botState: updatedBotState });
    } catch (error) {
        console.error('Error toggling bot state:', error);
        res.status(500).json({ success: false, message: error.message || 'Error changing bot state.' });
    }
};

// --- Controlador: Precio Ticker ---
exports.getTickerPrice = async (req, res) => {
    const { symbol } = req.query; 
    if (!symbol) return res.status(400).json({ message: 'Symbol parameter is required.' });

    try {
        const tickerData = await bitmartService.getTicker(symbol);
        if (tickerData && tickerData.last_price) {
            res.status(200).json({ price: parseFloat(tickerData.last_price) });
        } else {
            res.status(404).json({ message: 'Ticker data not found.' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error fetching ticker data.' });
    }
};

// --- Actualizar Configuración del Bot ---
exports.updateBotConfig = async (req, res) => {
    const userId = req.user.id;
    const { config } = req.body;

    if (!config) return res.status(400).json({ success: false, message: 'Configuration data missing.' });

    try {
        let bot = await Autobot.findOne({ userId });

        if (!bot) {
            bot = new Autobot({ userId, config, lbalance: config.long.amountUsdt || 0 });
        } else {
            bot.config = config;
            if (bot.lstate === 'STOPPED') {
                bot.lbalance = config.long.amountUsdt || bot.lbalance;
            }
        }

        await bot.save();
        res.status(200).json({ success: true, message: 'Bot configuration updated.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating configuration.' });
    }
};