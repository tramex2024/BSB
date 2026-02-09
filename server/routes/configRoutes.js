// server/routes/configRoutes.js


const express = require('express');
const router = express.Router();
const configController = require('../controllers/configController');
const userController = require('../controllers/userController'); // Importamos para usar el middleware
const bitmartAuthMiddleware = require('../middleware/bitmartAuthMiddleware'); // Inyecta credenciales

/**
 * RUTAS DE CONFIGURACIÓN ESTRATÉGICA
 * Todas requieren autenticación previa para obtener el req.user.id
 */
router.use(userController.authenticateToken);

/**
 * @desc Obtiene la configuración actual del bot del usuario logueado
 */
router.get('/', configController.getBotConfig); 

/**
 * @desc Actualiza la configuración, valida fondos en BitMart y sincroniza
 * Nota: Usamos bitmartAuthMiddleware porque el controlador valida balances reales
 */
router.post('/update-config', bitmartAuthMiddleware, configController.updateBotConfig); 

module.exports = router;