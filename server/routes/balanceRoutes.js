// /BSB/server/routes/balanceRoutes.js (CORREGIDO)

const express = require('express');
const router = express.Router();
// Reemplazamos la lógica directa por el controlador
const balanceController = require('../controllers/balanceController');

// ----------------------------------------------------------------------------------
// 🛑 RUTA DISCUTIDA: /api/v1/balances/bot-state/balances
// Dado que 'balances' es la base en server.js, definimos el resto del path aquí.
// ----------------------------------------------------------------------------------

// [OPCIONAL] Ruta anterior que resultaba en /api/v1/balances/available
// router.get('/available', balanceController.getAccountBalances);

// 🎯 NUEVA RUTA: Implementa el path que discutimos
// Este endpoint DEBERÍA llamar a una función específica que devuelva los saldos
// del bot (DB y Exchange). Asumiremos que el mismo controller puede manejarlo.
router.get('/balances', balanceController.getAccountBalances);


module.exports = router;