// server/routes/ordersRoutes.js

const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const userController = require('../controllers/userController');

// Protegemos todas las rutas
router.use(userController.authenticateToken);

// GET /api/orders/:status (all, opened, filled, cancelled)
router.get('/:status', orderController.getOrders);

module.exports = router;