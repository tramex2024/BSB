const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const userController = require('../controllers/userController'); 
const bitmartAuthMiddleware = require('../middleware/bitmartAuthMiddleware'); 

/**
 * 1. PROTECCIÓN GLOBAL
 */
router.use(userController.authenticateToken);

/**
 * RUTAS DE TELEMETRÍA Y CONFIGURACIÓN
 */
router.get('/status', aiController.getAIStatus);
router.get('/history', aiController.getVirtualHistory);
router.post('/toggle', bitmartAuthMiddleware, aiController.toggleAI);
router.post('/config', aiController.updateAIConfig);

/**
 * @route   POST /api/ai/panic-stop
 * @desc    CIERRE DE EMERGENCIA
 * Delegamos la lógica al controlador que ya tiene acceso al aiEngine y la DB.
 */
router.post('/panic-stop', aiController.panicSell); 

module.exports = router;