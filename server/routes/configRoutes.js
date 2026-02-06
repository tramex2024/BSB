// server/routes/configRoutes.js
const express = require('express');
const router = express.Router();
const configController = require('../controllers/configController');

/**
 * @route   GET /api/autobot (o la ruta base definida en server.js)
 * @desc    Obtiene la configuración actual del bot
 */
router.get('/', configController.getBotConfig); 

/**
 * @route   POST /api/autobot/update-config
 * @desc    Actualiza la configuración y recalculas balances
 */
router.post('/update-config', configController.updateBotConfig); 

module.exports = router;