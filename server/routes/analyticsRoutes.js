// BSB/server/routes/analyticsRoutes.js

const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const authMiddleware = require('../middleware/authMiddleware'); // Asumo esta es tu ubicación

// Ruta base para todas las analíticas: /api/v1/analytics

// 1. Obtener Key Performance Indicators (KPIs)
// Requiere autenticación
router.get('/kpis', authMiddleware, analyticsController.getCycleKpis);

// 2. Obtener datos para la Curva de Crecimiento de Capital
// Requiere autenticación
router.get('/equity-curve', authMiddleware, analyticsController.getEquityCurveData);

module.exports = router;