// BSB/server/routes/aiRoutes.js

const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');

/**
 * RUTA: GET /api/ai/status
 * DESCRIPCIÓN: Obtiene balance virtual, estado de ejecución (ON/OFF) y configuración actual.
 */
router.get('/status', aiController.getAIStatus);

/**
 * RUTA: GET /api/ai/history
 * DESCRIPCIÓN: Obtiene los últimos trades virtuales realizados por la IA para la tabla.
 */
router.get('/history', aiController.getVirtualHistory);

/**
 * RUTA: POST /api/ai/toggle
 * DESCRIPCIÓN: Enciende o apaga el motor neuronal de la IA.
 */
router.post('/toggle', aiController.toggleAI);

/**
 * ✅ RUTA: POST /api/ai/config
 * DESCRIPCIÓN: Actualiza el monto de entrenamiento (amountUsdt) y otros parámetros.
 */
router.post('/config', aiController.updateAIConfig);

/**
 * 🚨 RUTA: POST /api/ai/panic
 * DESCRIPCIÓN: Cierra cualquier posición abierta al precio actual y apaga el bot.
 */
router.post('/panic', aiController.panicSell);

module.exports = router;