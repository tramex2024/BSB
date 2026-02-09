// BSB/server/controllers/userController.js

/**
 * BSB/server/controllers/userController.js
 * CONTROLADOR DE USUARIO Y OPERACIONES PRIVADAS
 */

const User = require('../models/User');
const Autobot = require('../models/Autobot');
const jwt = require('jsonwebtoken');
const { encrypt, decrypt } = require('../utils/encryption');
const bitmartService = require('../services/bitmartService');
const autobotLogic = require('../autobotLogic');

// ==========================================
//          MIDDLEWARES DE SEGURIDAD
// ==========================================

/**
 * 1. Verifica que el JWT sea válido.
 */
exports.authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Authentication token required.' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            console.error("[AUTH] JWT Error:", err.message);
            return res.status(403).json({ message: 'Invalid or expired token.' });
        }
        req.user = decoded; 
        next();
    });
};

/**
 * 2. Inyecta credenciales descifradas en el objeto req.
 * Crucial para que los controladores puedan hablar con BitMart.
 */
exports.injectBitmartCreds = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user || !user.bitmartApiKey) {
            return res.status(400).json({ 
                success: false, 
                message: 'BitMart API keys not configured or user not found.' 
            });
        }

        // Desciframos las llaves para uso en la petición actual
        req.bitmartCreds = {
            apiKey: decrypt(user.bitmartApiKey),
            secretKey: decrypt(user.bitmartSecretKeyEncrypted),
            apiMemo: decrypt(user.bitmartApiMemo)
        };
        next();
    } catch (error) {
        console.error("[CREDS-INJECTOR] Error:", error.message);
        res.status(500).json({ message: 'Error processing credentials.' });
    }
};

// ==========================================
//         GESTIÓN DE CREDENCIALES
// ==========================================

exports.saveBitmartApiKeys = async (req, res) => {
    const { apiKey, secretKey, apiMemo } = req.body;

    try {
        if (!apiKey || !secretKey) {
            return res.status(400).json({ message: 'API Key and Secret Key are required.' });
        }

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found.' });

        // Encriptamos antes de guardar en la DB
        user.bitmartApiKey = encrypt(apiKey); 
        user.bitmartSecretKeyEncrypted = encrypt(secretKey);
        user.bitmartApiMemo = encrypt(apiMemo || '');
        user.bitmartApiValidated = true;

        await user.save();

        res.status(200).json({ 
            success: true, 
            message: 'BitMart keys encrypted and saved successfully.' 
        });
    } catch (error) {
        console.error('Error saving keys:', error);
        res.status(500).json({ message: 'Internal error encrypting keys.' });
    }
};

// ==========================================
//          OPERACIONES DE EXCHANGE
// ==========================================

exports.getBitmartBalance = async (req, res) => {
    try {
        // req.bitmartCreds viene del middleware injectBitmartCreds
        const balances = await bitmartService.getBalance(req.bitmartCreds);
        res.status(200).json(balances);
    } catch (error) {
        res.status(500).json({ message: error.message || 'Error fetching balance.' });
    }
};

exports.getBitmartOpenOrders = async (req, res) => {
    const { symbol } = req.query;
    try {
        const result = await bitmartService.getOpenOrders(symbol || 'BTC_USDT', req.bitmartCreds);
        res.status(200).json({ success: true, orders: result.orders });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Error fetching open orders.' });
    }
};

exports.getHistoryOrders = async (req, res) => {
    try {
        const { status } = req.query;
        const userId = req.user.id;

        let filter = { userId: userId };
        if (status && status !== 'all') {
            filter.status = status.toUpperCase(); // FILLED, CANCELED, etc.
        }

        const orders = await Order.find(filter).sort({ orderTime: -1 }).limit(50);
        res.status(200).json(orders); // Esto devuelve el ARRAY que el frontend espera
    } catch (error) {
        res.status(500).json({ message: 'Error recuperando órdenes de la DB local.' });
    }
};

exports.getTickerPrice = async (req, res) => {
    const { symbol } = req.query; 
    if (!symbol) return res.status(400).json({ message: 'Symbol is required.' });

    try {
        const tickerData = await bitmartService.getTicker(symbol);
        res.status(200).json({ price: parseFloat(tickerData.last_price) });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching ticker data.' });
    }
};

// ==========================================
//          LÓGICA DEL BOT (ESTADO)
// ==========================================

exports.getBotConfigAndState = async (req, res) => {
    try {
        const botState = await Autobot.findOne({ userId: req.user.id });
        if (!botState) {
            return res.status(200).json({ isRunning: false, state: 'STOPPED', lbalance: 0 });
        }
        res.status(200).json(botState);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching bot state.' });
    }
};

exports.toggleBotState = async (req, res) => {
    const { action, params } = req.body;
    try {
        // Ejecuta la lógica central y abre/cierra WS
        const updatedBotState = await autobotLogic.toggleBotState(
            req.user.id, 
            action, 
            params, 
            req.bitmartCreds
        );
        res.status(200).json({ success: true, botState: updatedBotState });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateBotConfig = async (req, res) => {
    const { config } = req.body;
    if (!config) return res.status(400).json({ message: 'Config data missing.' });

    try {
        let bot = await Autobot.findOne({ userId: req.user.id });
        if (!bot) {
            bot = new Autobot({ userId: req.user.id, config, lbalance: config.long?.amountUsdt || 0 });
        } else {
            bot.config = config;
            // Solo actualizamos balance base si el bot está detenido para evitar saltos en el interés compuesto
            if (bot.lstate === 'STOPPED') {
                bot.lbalance = config.long?.amountUsdt || bot.lbalance;
            }
        }
        await bot.save();
        res.status(200).json({ success: true, message: 'Configuration updated.' });
    } catch (error) {
        res.status(500).json({ message: 'Error updating bot config.' });
    }
};