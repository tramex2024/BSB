// BSB/server/src/utils/coverageLogic.js

const { getOrderDetail } = require('../../services/bitmartService');
const autobotCore = require('../../autobotLogic');
const { placeCoverageBuyOrder, MIN_USDT_VALUE_FOR_BITMART } = require('./orderManager');
const { updateLStateData } = require('../../autobotLogic'); // Importa la función de guardado

/**
 * Verifica si se necesita colocar una nueva orden de cobertura y la coloca.
 * @param {object} botState - Estado actual del bot.
 * @param {number} availableUSDT - USDT disponible.
 * @param {number} currentPrice - Precio actual del activo.
 * @param {object} creds - Credenciales de la API.
 * @param {object} config - Configuración del bot.
 */
async function checkAndPlaceCoverageOrder(botState, availableUSDT, currentPrice, creds, config) {
    // 1. Bloqueo de Cobertura: Si ya hay una orden activa
    if (botState.lStateData.lastOrder && botState.lStateData.lastOrder.side === 'buy' && botState.lStateData.lastOrder.order_id) {
        try {
            const SYMBOL = config.symbol || 'BTC_USDT';
            const orderDetails = await getOrderDetail(creds, SYMBOL, botState.lStateData.lastOrder.order_id);
            
            // Bloquea si la orden está en curso (new, partially_filled, pending)
            if (orderDetails && (orderDetails.state === 'new' || orderDetails.state === 'partially_filled' || orderDetails.state === 'pending')) {
                autobotCore.log(`Ya hay una orden de cobertura activa (ID: ${orderDetails.order_id}). Esperando su ejecución.`, 'info');
                return;
            }
            
        } catch (error) {
            autobotCore.log(`Error al verificar el estado de la orden ${botState.lStateData.lastOrder.order_id}. ${error.message}`, 'error');
        }
    }
    
    // 2. Cálculo del Tamaño de la Orden
    const baseUSDTAmount = parseFloat(config.long.purchaseUsdt);
    const nextUSDTAmount = baseUSDTAmount * (1 + (config.long.size_var / 100) * botState.lStateData.orderCountInCycle);

    // 3. Cálculo del Precio de Disparo
    const lastPrice = botState.lStateData.ppc || currentPrice; 
    const nextCoveragePrice = lastPrice * (1 - (config.long.price_var / 100));

    // 4. Condición de Disparo y Colocación
    if (currentPrice <= nextCoveragePrice) {
        if (availableUSDT >= nextUSDTAmount && nextUSDTAmount >= MIN_USDT_VALUE_FOR_BITMART) {
            await placeCoverageBuyOrder(botState, creds, nextUSDTAmount, nextCoveragePrice);
        } else {
            // AÑADIDO: Lógica de NO_COVERAGE

        // 1. Guardar el monto que se necesitaba para la próxima orden.
        botState.lStateData.requiredCoverageAmount = nextUSDTAmount;
        await updateLStateData(botState.lStateData); // Persiste en la DB

        // 2. Transicionar a NO_COVERAGE.
        autobotCore.log("Fondos insuficientes para la próxima cobertura. Cambiando a NO_COVERAGE.", 'warning');
        await autobotCore.updateBotState('NO_COVERAGE', botState.sstate);
    }
  }
}

module.exports = {
    checkAndPlaceCoverageOrder
};