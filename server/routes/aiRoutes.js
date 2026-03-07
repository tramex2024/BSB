/**
 * BSB/server/routes/aiRoutes.js
 * RUTAS DEL MOTOR NEURAL IA - ARQUITECTURA BLINDADA 2026
 * Prefijo sugerido en server.js: app.use('/api/ai', aiRoutes);
 */

const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const userController = require('../controllers/userController'); // Middleware de JWT
const bitmartAuthMiddleware = require('../middleware/bitmartAuthMiddleware'); // Inyector de credenciales

/**
 * 1. PROTECCIÓN GLOBAL: Middleware de autenticación JWT
 * 🟢 AUDITORÍA: Ninguna ruta de IA es accesible sin una sesión válida.
 */
router.use(userController.authenticateToken);

/**
 * @route   GET /api/ai/status
 * @desc    Consulta de telemetría: balance, estado operativo y velas sincronizadas.
 */
router.get('/status', aiController.getAIStatus);

/**
 * @route   GET /api/ai/history
 * @desc    Historial de órdenes simuladas/reales del motor IA.
 */
router.get('/history', aiController.getVirtualHistory);

/**
 * @route   POST /api/ai/toggle
 * @desc    Activación/Desactivación del motor. 
 * Requiere BitMart Auth para asegurar que el motor pueda consultar precios reales.
 */
router.post('/toggle', bitmartAuthMiddleware, aiController.toggleAI);

/**
 * @route   POST /api/ai/config
 * @desc    Actualiza parámetros de inversión y comportamiento de ciclos.
 */
router.post('/config', aiController.updateAIConfig);

/**
 * @route   POST /api/ai/panic
 * @desc    CIERRE DE EMERGENCIA: Detención inmediata y limpieza de buffers.
 */
router.post('/panic', bitmartAuthMiddleware, aiController.panicSell);

module.exports = router;