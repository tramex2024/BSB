// server/routes/userRoutes.js
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
// No necesitamos importar bitmartService ni User aquí si los controladores los manejan.
// Tampoco necesitamos { encrypt } si la encriptación se hace dentro del controlador (como en userController.js)

// Ruta para guardar y validar las API keys de BitMart
router.post('/save-api-keys', authenticateToken, saveBitmartApiKeys);

// Ruta para obtener el balance del usuario (requiere credenciales de BitMart)
router.get('/bitmart/balance', authenticateToken, bitmartAuthMiddleware, getBitmartBalance);

// Ruta para obtener órdenes abiertas del usuario (requiere credenciales de BitMart)
router.get('/bitmart/open-orders', authenticateToken, bitmartAuthMiddleware, getBitmartOpenOrders);

// Ruta para colocar una orden (requiere credenciales de BitMart)
// Si esta lógica está en el controlador, la llamamos. Si no, debería estar en un controlador.
// Suponiendo que placeOrder es un método en bitmartService directamente, la ruta original era:
// router.post('/bitmart/place-order', authMiddleware, bitmartAuthMiddleware, async (req, res) => { ... });
// Necesitamos un controlador si queremos seguir el patrón. Por ahora, lo dejaré con la lógica original si existe.
// Si tu placeOrder del frontend llama a '/api/toggle-bot' para iniciar el bot, esa es una ruta diferente.
// Si esta es una ruta para colocar UNA orden específica manualmente, entonces necesitaría un controlador para ella.
// Asumo que 'placeOrder' en userRoutes es una acción directa de BitMart, no la lógica del bot.
router.post('/bitmart/place-order', authenticateToken, bitmartAuthMiddleware, async (req, res) => {
    const { symbol, side, type, size, price } = req.body;
    try {
        console.log('[placeOrder] Colocando orden para usuario:', req.user.id); // Log de inicio
        // Asegúrate de que el bitmartService.placeOrder tome req.bitmartCreds
        const orderResult = await bitmartService.placeOrder(req.bitmartCreds, symbol, side, type, size, price);
        console.log('[placeOrder] Orden colocada con éxito.'); // Log de éxito
        res.status(200).json(orderResult);
    } catch (error) {
        console.error('Error al colocar orden en BitMart (en userRoutes):', error); // Log detallado del error
        res.status(500).json({ message: 'Error al colocar orden en BitMart.', error: error.message });
    }
});


// Ruta para obtener el historial de órdenes (si ya lo tienes en bitmartService)
router.get('/bitmart/history-orders', authenticateToken, bitmartAuthMiddleware, getBitmartHistoryOrders);


// --- NUEVA RUTA: Obtener Configuración y Estado del Bot ---
router.get('/bot-config-and-state', authenticateToken, getBotConfigAndState);


module.exports = router;
