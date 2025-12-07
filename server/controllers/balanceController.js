// controllers/balanceController.js

// const bitmartService = require('../services/bitmartService'); // 🛑 ELIMINAMOS LA DEPENDENCIA DIRECTA
const Autobot = require('../models/Autobot'); // 💡 Necesario para obtener saldos
const { log } = require('../autobotLogic'); // Para el registro de errores

/**
 * @desc Obtiene los balances de trading disponibles (USDT y BTC) de la CACHÉ de la DB
 * y los balances asignados (lbalance, sbalance) del estado interno del bot.
 * @route GET /api/v1/bot-state/balances // 🎯 RUTA FINAL CORREGIDA
 * @access Private
 */
async function getAccountBalances(req, res) {
    let responseData = {
        // Inicialización de Balances Reales de BitMart con valores de la caché (o 0)
        exchange: {
            availableUSDT: 0, 
            availableBTC: 0,
            lastCacheCheck: null // Nuevo campo para indicar cuándo se actualizó por última vez la caché
        }, 
        // Inicialización de Balances Asignados
        assigned: {
            lbalance: 0,
            sbalance: 0
        }
    };

    // 1. OBTENER SALDOS (Caché de la DB)
    try {
        const botState = await Autobot.findOne({});
        
        if (!botState) {
            log('Error: Autobot configuration document not found in DB.', 'error');
            // Devolver valores por defecto si no hay documento
            return res.status(200).json({ success: true, data: responseData });
        }

        // 2. POBLAR LA RESPUESTA CON VALORES DE LA CACHÉ Y ASIGNADOS
        responseData.exchange.availableUSDT = parseFloat(botState.lastAvailableUSDT || 0);
        responseData.exchange.availableBTC = parseFloat(botState.lastAvailableBTC || 0);
        responseData.exchange.lastCacheCheck = botState.lastBalanceCheck || null;

        responseData.assigned.lbalance = parseFloat(botState.lbalance || 0);
        responseData.assigned.sbalance = parseFloat(botState.sbalance || 0);

        
    } catch (error) {
        log(`Error al obtener los balances desde la caché de la DB: ${error.message}`, 'error');
        // Si hay un error de DB, devolvemos los valores inicializados en 0.
        return res.status(500).json({ success: false, msg: 'Server error retrieving balance cache.', data: responseData });
    }

    // 3. ENVIAR LA RESPUESTA AL FRONTEND
    return res.status(200).json({ 
        success: true, 
        data: responseData
    });
}

module.exports = {
    getAccountBalances,
};