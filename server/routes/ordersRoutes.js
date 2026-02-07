// server/routes/ordersRoutes.js

const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const authMiddleware = require('../middleware/authMiddleware');

// Verifica que orderController.getOrders sea una función antes de pasarla
if (typeof orderController.getOrders !== 'function') {
    console.error('❌ ERROR: orderController.getOrders no es una función. Revisa el archivo del controlador.');
}

router.get('/:status', authMiddleware, orderController.getOrders);

module.exports = router;