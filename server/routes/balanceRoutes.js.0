// /BSB/server/routes/balanceRoutes.js (CORREGIDO)

const express = require('express');
const router = express.Router();
// 💡 Reemplazamos la lógica directa por el controlador
const balanceController = require('../controllers/balanceController'); 
// const { log } = require('../autobotLogic'); // Ya no es necesario aquí, el controller lo tiene

// Ruta GET: Obtiene los balances de trading disponibles (Exchange y Asignados de la DB)
// El endpoint se llamará /api/v1/balance/available
router.get('/available', balanceController.getAccountBalances);

module.exports = router;