// BSB/server/routes/analyticsRoutes.js

const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const userController = require('../controllers/userController'); // Usando el middleware unificado

/**
 * RUTAS DE ANALÍTICAS Y RENDIMIENTO (BSB 2026)
 * Prefijo en server.js: /api/v1/analytics
 */

// Aplicamos autenticación a todas las rutas de este archivo
router.use(userController.authenticateToken);

/**
 * 1. Obtener Estadísticas Globales (KPIs)
 * Proporciona: Win Rate, Beneficio Neto Total, Promedio por ciclo.
 */
router.get('/stats', analyticsController.getCycleKpis);

/**
 * 2. Obtener datos para la Curva de Capital (Equity Curve)
 * Devuelve una serie temporal para graficar el crecimiento de la cuenta.
 */
router.get('/equity-curve', analyticsController.getEquityCurveData);

/**
 * 3. Obtener Historial de Ciclos (Tabla)
 * Devuelve la lista de ciclos completados con paginación.
 */
router.get('/cycles', analyticsController.getTradeCycles);

module.exports = router;