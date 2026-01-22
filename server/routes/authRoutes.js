// server/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Ruta para solicitar el token de login
router.post('/request-token', authController.requestToken);

// Ruta para verificar el token y obtener el token de sesión
router.post('/verify-token', authController.verifyToken);

module.exports = router;