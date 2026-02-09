// /BSB/server/routes/balanceRoutes.js (CORREGIDO)

const express = require('express');
const router = express.Router();
const balanceController = require('../controllers/balanceController');
const userController = require('../controllers/userController'); // Para el middleware de Auth

/**
 * RUTAS DE BALANCES Y SALDOS
 * Estas rutas devuelven tanto el saldo real en BitMart (caché) como el asignado al bot.
 */

// 1. Protección Global: Solo usuarios autenticados pueden ver saldos
router.use(userController.authenticateToken);

/**
 * @route   GET /api/v1/balances/
 * @desc    Obtiene el consolidado de saldos (Exchange + Bot Asignado)
 * Nota: Si dejas solo '/', la ruta final será la base definida en server.js
 */
router.get('/', balanceController.getAccountBalances);

// Mantengo esta por si tu frontend ya está apuntando específicamente a /balances
router.get('/current', balanceController.getAccountBalances);

module.exports = router;