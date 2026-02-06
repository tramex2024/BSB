// /BSB/server/routes/configRoutes.js (MODIFICADO)

const express = require('express');
const router = express.Router();

// 🛑 IMPORTAR EL NUEVO CONTROLADOR
const configController = require('../controllers/configController'); 
const { log } = require('../autobotLogic'); 

// Ruta GET: Obtiene la configuración actual del bot
// Usa el método del controlador
router.get('/', configController.getBotConfig); 

// Ruta POST: Actualiza la configuración con validación y establece LBalance/SBalance
// Usa el método del controlador
router.post('/', configController.updateBotConfig); 

module.exports = router;