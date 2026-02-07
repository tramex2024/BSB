// server/routes/ordersRoutes.js

const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// Asegúrate de que el nombre de la ruta sea 'api-keys'
router.post('/api-keys', userController.authenticateToken, userController.saveBitmartApiKeys);

module.exports = router;