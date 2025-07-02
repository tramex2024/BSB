// server/routes/userRoutes.js

const express = require('express');
const router = express.Router();
// Importamos todo el objeto userController
const userController = require('../controllers/userController');

const bitmartAuthMiddleware = require('../middleware/bitmartAuthMiddleware');
const bitmartService = require('../services/bitmartService'); // Asegúrate de que esta línea esté presente

// Middleware de autenticación global para todas las rutas de usuario
// Esto simplifica la aplicación de authenticateToken a todas las rutas.
// Si necesitas alguna ruta pública en userRoutes, podrías moverla antes de esta línea.
router.use(userController.authenticateToken);

// --- Rutas específicas del usuario (protegidas por authenticateToken) ---

// Ruta para guardar y validar las API keys de BitMart
router.post('/save-api-keys', userController.saveBitmartApiKeys);

// Ruta para obtener el balance del usuario (requiere credenciales de BitMart)
// NOTA: 'bitmartAuthMiddleware' se asegura de que req.bitmartCreds esté disponible
router.get('/bitmart/balance', bitmartAuthMiddleware, userController.getBitmartBalance);

// Ruta para obtener órdenes abiertas del usuario (requiere credenciales de BitMart)
router.get('/bitmart/open-orders', bitmartAuthMiddleware, userController.getBitmartOpenOrders);

// Ruta para colocar una orden (requiere credenciales de BitMart)
router.post('/bitmart/place-order', bitmartAuthMiddleware, async (req, res) => {
    const { symbol, side, type, size, price } = req.body;
    try {
        console.log('[placeOrder] Colocando orden para usuario:', req.user.id);
        // Asegúrate de que bitmartService.placeOrder tome req.bitmartCreds
        const orderResult = await bitmartService.placeOrder(req.bitmartCreds, symbol, side, type, size, price);
        console.log('[placeOrder] Orden colocada con éxito.');
        res.status(200).json(orderResult);
    } catch (error) {
        console.error('Error al colocar orden en BitMart (en userRoutes):', error);
        res.status(500).json({ message: 'Error al colocar orden en BitMart.', error: error.message });
    }
});

// --- RUTA CLAVE: Historial de Órdenes (para Opened, Filled, Cancelled, All en el frontend) ---
// La ruta del frontend es '/api/user/history-orders', así que aquí solo necesitamos '/history-orders'
// Esta ruta ahora usa 'userController.getHistoryOrders' que renombramos en el userController.
router.get('/history-orders', bitmartAuthMiddleware, userController.getHistoryOrders);

// Ruta para obtener la configuración y el estado del bot
router.get('/bot-config-and-state', userController.getBotConfigAndState);

// Ruta para alternar el estado del bot (start/stop)
router.post('/toggle-bot', userController.toggleBotState);


module.exports = router;