// server/routes/ordersRoutes.js

const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const userController = require('../controllers/userController'); // Necesario para el middleware de Auth

/**
 * RUTAS DE HISTORIAL DE ÓRDENES (DB LOCAL)
 * Base path sugerido: /api/v1/orders
 */

// 1. Middleware Global para este router: Todas las consultas de órdenes requieren JWT
router.use(userController.authenticateToken);

// 2. Obtener órdenes filtradas por estado (all, opened, filled, cancelled)
// Ejemplo: GET /api/v1/orders/filled
router.get('/:status', orderController.getOrders);

module.exports = router;