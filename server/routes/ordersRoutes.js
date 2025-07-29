// server/routes/ordersRoutes.js

const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController'); // Importa el controlador
const authMiddleware = require('../middleware/authMiddleware'); // Asegúrate de tener este middleware para proteger la ruta

// Ruta para obtener las órdenes
// Protegida por el middleware de autenticación (asumiendo que verifica el token y adjunta req.user)
router.get('/', authMiddleware, orderController.getOrders);

module.exports = router;