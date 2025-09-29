// /BSB/server/routes/configRoutes.js

const express = require('express');
const router = express.Router();
const Autobot = require('../models/Autobot'); 
const bitmartService = require('../services/bitmartService'); // Importar el servicio
const { log } = require('../autobotLogic'); // Importar el logger

// Ruta GET: Obtiene la configuración actual del bot
router.get('/', async (req, res) => {
    try {
        const botState = await Autobot.findOne({});
        if (!botState) {
            return res.status(404).json({ success: false, message: 'No se encontró el estado inicial del bot.' });
        }
        res.json({ success: true, config: botState.config });
    } catch (error) {
        log(`Error al obtener la configuración: ${error.message}`, 'error');
        res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
});


// Ruta POST: Actualiza la configuración con validación de fondos
router.post('/', async (req, res) => {
    try {
        const newConfig = req.body;
        
        // --- 1. OBTENER SALDOS REALES DE BITMART ---
        const { availableUSDT, availableBTC } = await bitmartService.getAvailableTradingBalances();

        // --- 2. VALIDACIÓN CRÍTICA DE ASIGNACIÓN DE FONDOS LONG (USDT) ---
        const assignedUSDT = parseFloat(newConfig.long.purchaseUsdt); 
        
        if (assignedUSDT > availableUSDT) {
            const msg = `Error: La asignación de USDT para la estrategia Long (${assignedUSDT.toFixed(2)} USDT) excede el saldo real disponible en BitMart (${availableUSDT.toFixed(2)} USDT).`;
            log(msg, 'error');
            return res.status(400).json({ success: false, message: msg });
        }

        // --- 3. VALIDACIÓN CRÍTICA DE ASIGNACIÓN DE FONDOS SHORT (BTC) ---
        const assignedBTC = parseFloat(newConfig.short.purchaseBTC || 0); 
        
        if (assignedBTC > availableBTC) {
            const msg = `Error: La asignación de BTC para la estrategia Short (${assignedBTC.toFixed(8)} BTC) excede el saldo real disponible en BitMart (${availableBTC.toFixed(8)} BTC).`;
            log(msg, 'error');
            return res.status(400).json({ success: false, message: msg });
        }

        // --- 4. GUARDAR Y RESPONDER (Solo si la validación pasa) ---
        let botState = await Autobot.findOne({});
        if (!botState) {
            botState = new Autobot({ config: newConfig });
        } else {
            botState.config = newConfig;
        }
        await botState.save();

        log('Configuración guardada exitosamente y validada contra los balances de BitMart.', 'success');
        res.json({ success: true, message: 'Configuración actualizada.' });

    } catch (error) {
        log(`Error al actualizar la configuración: ${error.message}`, 'error');
        res.status(500).json({ success: false, message: 'Error interno del servidor al actualizar la configuración.' });
    }
});

module.exports = router;