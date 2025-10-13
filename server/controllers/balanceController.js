// server/controllers/balanceController.js

const bitmartService = require('../services/bitmartService');
const Autobot = require('../models/Autobot'); // 💡 Necesario para obtener lbalance/sbalance
const { log } = require('../autobotLogic'); // Para el registro de errores

/**
 * Obtiene los balances de trading disponibles (USDT y BTC) del exchange 
 * y los balances asignados (lbalance, sbalance) del estado interno del bot.
 */
async function getAccountBalances(req, res) {
    let exchangeBalances = { availableUSDT: 0, availableBTC: 0 };
    let botLBalance = 0;
    let botSBalance = 0;

    // 1. OBTENER SALDOS DEL EXCHANGE (API BitMart)
    try {
        // Asumimos que getAvailableTradingBalances ya usa las credenciales del servidor/entorno
        exchangeBalances = await bitmartService.getAvailableTradingBalances();
    } catch (error) {
        log(`Error al obtener los balances de BitMart: ${error.message}`, 'error');
        // El exchangeBalances ya está inicializado en 0, lo cual es seguro.
    }

    // 2. OBTENER BALANCES ASIGNADOS (DB Autobot)
    try {
        const botState = await Autobot.findOne({});
        if (botState) {
            // Utilizamos los campos lbalance y sbalance del modelo Autobot
            botLBalance = parseFloat(botState.lbalance || 0);
            botSBalance = parseFloat(botState.sbalance || 0);
        }
    } catch (error) {
        log(`Error al obtener los balances asignados (lbalance/sbalance) de la DB: ${error.message}`, 'error');
        // Los balances asignados ya están inicializados en 0.
    }

    // 3. COMBINAR Y ENVIAR LA RESPUESTA AL FRONTEND
    const responseData = {
        // Balances Reales de BitMart
        exchange: exchangeBalances, 
        // Balances Asignados por el bot (del modelo Autobot)
        assigned: {
            lbalance: botLBalance,
            sbalance: botSBalance
        }
    };
    
    // Devolvemos 200 OK, incluso si el exchange falló, ya que al menos tenemos los balances asignados (o 0).
    return res.status(200).json({ 
        success: true, 
        data: responseData
    });
}

module.exports = {
    getAccountBalances,
};