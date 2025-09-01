// server/routes/ordersRoutes.js

const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController'); // Importa el controlador
const authMiddleware = require('../middleware/authMiddleware'); // Asegúrate de tener este middleware para proteger la ruta

// Ruta para obtener las órdenes. La ruta base es '/'
// que cuando se utiliza en server.js con app.use('/api/orders', ordersRoutes),
// se convierte en la ruta final '/api/orders'
router.get('/', authMiddleware, orderController.getOrders);

module.exports = router;