/**
 * BSB/server/routes/aiRoutes.js
 * RUTAS DEL MOTOR NEURAL IA
 * Prefijo en server.js: /api/ai
 */

const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const userController = require('../controllers/userController'); // Middleware de JWT
const bitmartAuthMiddleware = require('../middleware/bitmartAuthMiddleware'); // Inyector de credenciales

// 1. PROTECCIÓN GLOBAL: Middleware de autenticación JWT
// Todas las rutas siguientes requieren que el usuario esté logueado.
router.use(userController.authenticateToken);

/**
 * @route   GET /api/ai/status
 * @desc    Obtiene balance virtual, estado de ejecución y configuración.
 */
router.get('/status', aiController.getAIStatus);

/**
 * @route   GET /api/ai/history
 * @desc    Obtiene los últimos trades virtuales (filtrados por userId).
 */
router.get('/history', aiController.getVirtualHistory);

/**
 * @route   POST /api/ai/toggle
 * @desc    Enciende o Apaga el motor (Requiere validación de llaves BitMart).
 */
router.post('/toggle', bitmartAuthMiddleware, aiController.toggleAI);

/**
 * @route   POST /api/ai/config
 * @desc    Actualiza parámetros de configuración (monto, stopAtCycle).
 */
router.post('/config', aiController.updateAIConfig);

/**
 * @route   POST /api/ai/panic
 * @desc    CIERRE DE EMERGENCIA: Detiene el motor y limpia estados de entrada.
 */
router.post('/panic', bitmartAuthMiddleware, aiController.panicSell);

module.exports = router;