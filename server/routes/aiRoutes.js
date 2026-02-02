// BSB/server/routes/aiRoutes.js

const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');

/**
 * RUTA: GET /api/ai/status
 * DESCRIPCIÓN: Obtiene balance, estado de ejecución y configuración.
 */
router.get('/status', aiController.getAIStatus);

/**
 * RUTA: GET /api/ai/history
 * DESCRIPCIÓN: Obtiene los últimos trades virtuales realizados por la IA.
 */
router.get('/history', aiController.getVirtualHistory);

/**
 * RUTA: POST /api/ai/toggle
 * DESCRIPCIÓN: Enciende o apaga el motor neuronal.
 */
router.post('/toggle', aiController.toggleAI);

/**
 * ✅ RUTA: POST /api/ai/update-config
 * DESCRIPCIÓN: Actualiza el monto inicial (amountUsdt) y parámetros de la IA.
 */
router.post('/update-config', aiController.updateAIConfig);

module.exports = router;