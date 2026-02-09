// BSB/server/routes/aiRoutes.js

const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const userController = require('../controllers/userController'); // Middleware de JWT
const bitmartAuthMiddleware = require('../middleware/bitmartAuthMiddleware'); // Inyector de credenciales

/**
 * RUTAS DEL MOTOR NEURAL IA
 * Prefijo en server.js: /api/ai
 */

// 1. Protección Global: Nadie entra a la IA sin un token válido
router.use(userController.authenticateToken);

/**
 * @desc Obtiene balance virtual, estado de ejecución y configuración.
 */
router.get('/status', aiController.getAIStatus);

/**
 * @desc Obtiene los últimos trades virtuales (filtrados por userId).
 */
router.get('/history', aiController.getVirtualHistory);

/**
 * @desc Enciende/Apaga el motor (Requiere llaves para operar en BitMart).
 */
router.post('/toggle', bitmartAuthMiddleware, aiController.toggleAI);

/**
 * @desc Actualiza parámetros de configuración en el documento Autobot.
 */
router.post('/config', aiController.updateAIConfig);

/**
 * @desc CIERRE DE EMERGENCIA: Vende todo y detiene el bot (Requiere llaves).
 */
router.post('/panic', bitmartAuthMiddleware, aiController.panicSell);

module.exports = router;