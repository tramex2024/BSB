// server/routes/ordersRoutes.js

const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController'); // Importa el controlador
const authMiddleware = require('../middleware/authMiddleware'); // Asegúrate de tener este middleware para proteger la ruta

// Esta ruta ahora aceptará cualquier "status" como un parámetro dinámico
// La ruta completa será: /api/orders/:status
router.get('/:status', authMiddleware, orderController.getOrders);

module.exports = router;