// backend/routes/userRoutes.js
const express = require('express');
const router = express.Router();
// Importamos directamente las funciones del userController
const {
    authenticateToken, // Usado como middleware en algunas rutas
    saveBitmartApiKeys,
    getBitmartBalance,
    getBitmartOpenOrders,
    getBitmartHistoryOrders,
    getBotConfigAndState // ¡NUEVA FUNCIÓN IMPORTADA!
} = require('../controllers/userController');

const bitmartAuthMiddleware = require('../middleware/bitmartAuthMiddleware'); // Necesario para otras rutas
const bitmartService = require('../services/bitmartService'); // IMPORTANTE: Importar bitmartService aquí

// Ruta para guardar y validar las API keys de BitMart
router.post('/save-api-keys', authenticateToken, saveBitmartApiKeys);

// Ruta para obtener el balance del usuario (requiere credenciales de BitMart)
router.get('/bitmart/balance', authenticateToken, bitmartAuthMiddleware, getBitmartBalance);

// Ruta para obtener órdenes abiertas del usuario (requiere credenciales de BitMart)
router.get('/bitmart/open-orders', authenticateToken, bitmartAuthMiddleware, getBitmartOpenOrders);

// Ruta para colocar una orden (requiere credenciales de BitMart)
// Asumo que 'placeOrder' en userRoutes es una acción directa de BitMart, no la lógica del bot.
router.post('/bitmart/place-order', authenticateToken, bitmartAuthMiddleware, async (req, res) => {
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


// Ruta para obtener el historial de órdenes (si ya lo tienes en bitmartService)
router.get('/bitmart/history-orders', authenticateToken, bitmartAuthMiddleware, getBitmartHistoryOrders);

// --- NUEVO ENDPOINT: Obtener Hora del Servidor BitMart (Público) ---
// Este endpoint llamará a la función getSystemTime de bitmartService, que a su vez
// consulta la API pública de BitMart. No requiere bitmartAuthMiddleware porque es público.
router.get('/bitmart/system-time', async (req, res) => {
    try {
        const serverTime = await bitmartService.getSystemTime(); // Llama al servicio de BitMart
        res.json({ server_time: serverTime });
    } catch (error) {
        console.error('Error al obtener la hora del servidor de BitMart desde el backend:', error.message);
        res.status(500).json({ message: 'Error interno del servidor al obtener la hora del sistema BitMart.', error: error.message });
    }
});


// --- RUTA: Obtener Configuración y Estado del Bot ---
router.get('/bot-config-and-state', authenticateToken, getBotConfigAndState);


module.exports = router;
