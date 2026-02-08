/**
 * BSB/server/controllers/balanceController.js
 * CONTROLADOR DE BALANCES (Caché y Asignados) - Multi-usuario
 */

const Autobot = require('../models/Autobot'); 
const { log } = require('../autobotLogic'); 

/**
 * @desc Obtiene los balances de trading (USDT y BTC) desde la caché de la DB
 * filtrando estrictamente por el usuario autenticado.
 * @route GET /api/v1/bot-state/balances
 * @access Private (Requiere JWT)
 */
async function getAccountBalances(req, res) {
    const userId = req.user.id; // Extraído por authenticateToken

    let responseData = {
        exchange: {
            availableUSDT: 0, 
            availableBTC: 0,
            lastCacheCheck: null 
        }, 
        assigned: {
            lbalance: 0, // Balance actual en estrategia Long
            sbalance: 0, // Balance actual en estrategia Short
            aibalance: 0  // Añadimos balance de IA para consistencia
        }
    };

    try {
        // 1. OBTENER SALDOS ESPECÍFICOS DEL USUARIO
        const botState = await Autobot.findOne({ userId });
        
        if (!botState) {
            // Si el usuario es nuevo y no tiene configuración, devolvemos ceros
            return res.status(200).json({ 
                success: true, 
                message: "No bot configuration found for this user.",
                data: responseData 
            });
        }

        // 2. POBLAR RESPUESTA CON CACHÉ DE DB (Actualizada por el WebSocket/Service)
        responseData.exchange.availableUSDT = parseFloat(botState.lastAvailableUSDT || 0);
        responseData.exchange.availableBTC = parseFloat(botState.lastAvailableBTC || 0);
        responseData.exchange.lastCacheCheck = botState.lastBalanceCheck || null;

        // 3. POBLAR BALANCES OPERATIVOS (Asignados)
        // Estos valores representan lo que el bot tiene "permitido" gastar o lo que le queda
        responseData.assigned.lbalance = parseFloat(botState.lbalance || 0);
        responseData.assigned.sbalance = parseFloat(botState.sbalance || 0);
        responseData.assigned.aibalance = parseFloat(botState.aibalance || 0);

        return res.status(200).json({ 
            success: true, 
            data: responseData 
        });

    } catch (error) {
        log(`[BALANCE-CTRL] Error para usuario ${userId}: ${error.message}`, 'error');
        
        // En caso de error de base de datos, enviamos el esquema vacío para no romper el frontend
        return res.status(500).json({ 
            success: false, 
            message: 'Error retrieving balance information.', 
            data: responseData 
        });
    }
}

module.exports = {
    getAccountBalances,
};