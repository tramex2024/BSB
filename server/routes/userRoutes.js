// backend/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const bitmartAuthMiddleware = require('../middleware/bitmartAuthMiddleware');
const bitmartService = require('../services/bitmartService');
const User = require('../models/User');
const { encrypt } = require('../utils/encryption');
const BotState = require('../models/BotState'); // Importar el modelo BotState

// Ruta para guardar y validar las API keys de BitMart
router.post('/save-api-keys', authMiddleware, async (req, res) => {
    const { apiKey, secretKey, apiMemo } = req.body;
    const userId = req.user.id;

    if (!apiKey || !secretKey || !apiMemo) {
        console.warn('[save-api-keys] API Key, Secret Key o API Memo faltan.');
        return res.status(400).json({ message: 'API Key, Secret Key y API Memo son requeridos.' });
    }

    try {
        console.log('[save-api-keys] Intentando validar claves con BitMart...');
        const isValid = await bitmartService.validateApiKeys(apiKey, secretKey, apiMemo);

        if (!isValid) {
            console.warn('[save-api-keys] Validación de credenciales de BitMart fallida.');
            return res.status(400).json({ message: 'Las credenciales de BitMart API son inválidas o la conexión falló. Por favor, revísalas.' });
        }
        console.log('[save-api-keys] Credenciales de BitMart validadas con éxito.');

        const encryptedSecretKey = encrypt(secretKey);
        console.log('[save-api-keys] Secret Key encriptada. Longitud:', encryptedSecretKey.length);

        const user = await User.findById(userId);
        if (!user) {
            console.error('[save-api-keys] Usuario no encontrado para ID:', userId);
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }

        user.bitmartApiKey = apiKey;
        user.bitmartSecretKeyEncrypted = encryptedSecretKey;
        user.bitmartApiMemo = apiMemo;
        user.bitmartApiValidated = true;
        
        await user.save();
        console.log('[save-api-keys] Usuario y API keys guardadas en la DB para:', userId);

        res.status(200).json({ message: 'API keys validadas y guardadas con éxito.', connected: true });

    } catch (error) {
        console.error('Error al guardar o validar API keys (en userRoutes):', error);
        res.status(500).json({ message: 'Error interno del servidor al procesar las API keys.', connected: false });
    }
});

// NUEVA RUTA: Obtener el estado actual del bot para el usuario
router.get('/bot-state', authMiddleware, async (req, res) => {
    try {
        // Asegúrate de que el DEFAULT_BOT_USER_ID usado en autobotLogic sea el userId del usuario logueado
        // Si tu aplicación es multi-usuario, esto debe ser dinámico.
        // Por simplicidad, asumiremos que DEFAULT_BOT_USER_ID es el mismo que req.user.id
        const userId = req.user.id; 
        const botState = await BotState.findOne({ userId: userId });

        if (botState) {
            res.status(200).json(botState);
        } else {
            // Si no hay estado guardado, envía un estado por defecto (detenido)
            res.status(200).json({
                userId: userId,
                state: 'STOPPED',
                cycle: 0,
                profit: 0,
                cycleProfit: 0,
                currentPrice: 0,
                purchaseAmount: 0,
                incrementPercentage: 0,
                decrementPercentage: 0,
                triggerPercentage: 0,
                ppc: 0,
                cp: 0,
                ac: 0,
                pm: 0,
                pv: 0,
                pc: 0,
                lastOrder: null,
                openOrders: [],
                orderCountInCycle: 0,
                lastOrderUSDTAmount: 0,
                nextCoverageUSDTAmount: 0,
                nextCoverageTargetPrice: 0,
                stopOnCycleEnd: false
            });
        }
    } catch (error) {
        console.error('Error al obtener el estado del bot:', error);
        res.status(500).json({ message: 'Error interno del servidor al obtener el estado del bot.' });
    }
});

// Ruta para obtener el balance del usuario (requiere credenciales de BitMart)
router.get('/bitmart/balance', authMiddleware, bitmartAuthMiddleware, async (req, res) => {
    try {
        console.log('[getBitmartBalance] Obteniendo balance para usuario:', req.user.id);
        const balance = await bitmartService.getBalance(req.bitmartCreds);
        console.log('[getBitmartBalance] Balance obtenido con éxito.');
        res.json(balance);
    } catch (error) {
        console.error('Error al obtener balance de BitMart (en userRoutes):', error);
        res.status(500).json({ message: 'Error al obtener balance de BitMart.', error: error.message });
    }
});

// Ruta para obtener órdenes abiertas del usuario (requiere credenciales de BitMart)
router.get('/bitmart/open-orders', authMiddleware, bitmartAuthMiddleware, async (req, res) => {
    try {
        console.log('[getBitmartOpenOrders] Obteniendo órdenes abiertas para usuario:', req.user.id);
        const symbol = req.query.symbol;
        const openOrders = await bitmartService.getOpenOrders(req.bitmartCreds, symbol);
        console.log('[getBitmartOpenOrders] Órdenes abiertas obtenidas con éxito.');
        res.json(openOrders);
    } catch (error) {
        console.error('Error al obtener órdenes abiertas de BitMart (en userRoutes):', error);
        res.status(500).json({ message: 'Error al obtener órdenes abiertas de BitMart.', error: error.message });
    }
});

// Ruta para colocar una orden (requiere credenciales de BitMart)
router.post('/bitmart/place-order', authMiddleware, bitmartAuthMiddleware, async (req, res) => {
    const { symbol, side, type, size, price } = req.body;
    try {
        console.log('[placeOrder] Colocando orden para usuario:', req.user.id);
        const orderResult = await bitmartService.placeOrder(req.bitmartCreds, symbol, side, type, size, price);
        console.log('[placeOrder] Orden colocada con éxito.');
        res.status(200).json(orderResult);
    } catch (error) {
        console.error('Error al colocar orden en BitMart (en userRoutes):', error);
        res.status(500).json({ message: 'Error al colocar orden en BitMart.', error: error.message });
    }
});

module.exports = router;