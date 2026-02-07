// server/routes/userRoutes.js

const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const bitmartAuthMiddleware = require('../middleware/bitmartAuthMiddleware');
const bitmartService = require('../services/bitmartService');

// 1. Middleware de seguridad: Todas las rutas de abajo requieren que el usuario esté logueado
router.use(userController.authenticateToken);

// --- SECCIÓN: Gestión de Credenciales ---

// Esta es la ruta que corregimos para que coincida con lo que busca tu frontend
router.post('/api-keys', userController.saveBitmartApiKeys);


// --- SECCIÓN: Consultas a BitMart (Requieren desencriptar llaves) ---

// Obtener Balance
router.get('/bitmart/balance', bitmartAuthMiddleware, userController.getBitmartBalance);

// Obtener Órdenes Abiertas
router.get('/bitmart/open-orders', bitmartAuthMiddleware, userController.getBitmartOpenOrders);

// Obtener Historial de Órdenes (Opened, Filled, Cancelled)
router.get('/bitmart/history-orders', bitmartAuthMiddleware, userController.getHistoryOrders);

// Colocar una Orden Manualmente
router.post('/bitmart/place-order', bitmartAuthMiddleware, async (req, res) => {
    const { symbol, side, type, size, price } = req.body;
    try {
        console.log('[placeOrder] Colocando orden para usuario:', req.user.id);
        // Usamos req.bitmartCreds que viene del middleware
        const orderResult = await bitmartService.placeOrder(symbol, side, type, size, price, req.bitmartCreds);
        res.status(200).json(orderResult);
    } catch (error) {
        console.error('Error al colocar orden en BitMart:', error);
        res.status(500).json({ message: 'Error al colocar orden.', error: error.message });
    }
});


// --- SECCIÓN: Control del Bot ---

// Obtener configuración y estado actual del bot
router.get('/bot-config-and-state', userController.getBotConfigAndState);

// Encender o Apagar el Bot
router.post('/toggle-bot', bitmartAuthMiddleware, userController.toggleBotState);

// Actualizar la configuración técnica del Autobot
router.post('/autobot/update-config', userController.updateBotConfig);


// --- SECCIÓN: Datos Públicos ---

// Obtener precio actual de un símbolo (No necesita llaves privadas)
router.get('/bitmart/ticker', userController.getTickerPrice);


module.exports = router;