// BSB/server/routes/analyticsRoutes.js

const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const authMiddleware = require('../middleware/authMiddleware');

// Ruta base: /api/v1/analytics

/**
 * 1. Obtener Estadísticas Globales (KPIs)
 * Frontend busca: /api/v1/analytics/stats
 */
router.get('/stats', authMiddleware, analyticsController.getCycleKpis);

/**
 * 2. Obtener datos para la Curva de Capital
 * Frontend busca: /api/v1/analytics/equity-curve
 */
router.get('/equity-curve', authMiddleware, analyticsController.getEquityCurveData);

module.exports = router;