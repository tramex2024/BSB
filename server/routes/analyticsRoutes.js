// BSB/server/routes/analyticsRoutes.js

const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const userController = require('../controllers/userController');

/**
 * RUTAS DE ANALÍTICAS Y RENDIMIENTO (BSB 2026)
 * Prefijo en server.js: /api/v1/analytics
 */

/**
 * NIVEL DE SEGURIDAD:
 * Aplicamos autenticación a todas las rutas de este archivo de forma global.
 * Esto significa que cualquier petición a este router debe llevar un JWT válido.
 */
router.use(userController.authenticateToken);

/**
 * 1. Obtener Estadísticas Globales (KPIs)
 * Devuelve: Win Rate, Beneficio Neto, y el Profit/H que necesitamos para el dashboard.
 * Accesible vía: GET /api/v1/analytics/kpis
 */
router.get('/kpis', analyticsController.getCycleKpis);

/**
 * 2. Obtener datos para la Curva de Capital (Equity Curve)
 * Proporciona la serie temporal necesaria para renderizar el gráfico de crecimiento.
 * Accesible vía: GET /api/v1/analytics/equity-curve
 */
router.get('/equity-curve', analyticsController.getEquityCurveData);

/**
 * 3. Obtener Historial de Ciclos (Tabla)
 * Devuelve la lista de ciclos completados con soporte para paginación.
 * Accesible vía: GET /api/v1/analytics/cycles
 */
router.get('/cycles', analyticsController.getTradeCycles);

module.exports = router;