// server/routes/ordersRoutes.js

const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const userController = require('../controllers/userController');

// Protegemos todas las rutas
router.use(userController.authenticateToken);

/**
 * NUEVA RUTA: Filtrado dinámico para Autobot
 * Maneja: /api/orders/autobot/filter?strategy=long
 */
router.get('/autobot/filter', orderController.getOrders);

/**
 * RUTA ORIGINAL (Legado): Soporte para Dashboard y AIBot
 * GET /api/orders/:strategy/:status (all, opened, filled, cancelled)
 */
router.get('/:strategy/:status', orderController.getOrders);

module.exports = router;