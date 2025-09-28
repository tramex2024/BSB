// BSB/server/src/utils/coverageLogic.js

const { getOrderDetail } = require('../services/bitmartService');
const autobotCore = require('../../autobotLogic');
const { placeCoverageBuyOrder, MIN_USDT_VALUE_FOR_BITMART } = require('./orderManager');
// NOTA: updateLStateData NO se importa globalmente para romper la dependencia circular.

/**
 * Verifica las condiciones de cobertura y, si es necesario y hay fondos, coloca la orden.
 *
 * @param {object} botState - Objeto de estado del bot (de la DB).
 * @param {number} availableUSDT - USDT disponible en la cuenta.
 * @param {number} currentPrice - Precio actual del mercado.
 * @param {object} creds - Credenciales de la API.
 * @param {object} config - Configuración del bot.
 */
async function checkAndPlaceCoverageOrder(botState, availableUSDT, currentPrice, creds, config) {
    const { ppc, orderCountInCycle } = botState.lStateData;
    const { price_var, size_var, purchaseUsdt } = config.long;

    // Solo procedemos si ya hay una posición (PPC > 0), de lo contrario, estamos en RUNNING o BUYING inicial.
    if (ppc <= 0) {
        return;
    }

    // 1. CÁLCULO DEL PRÓXIMO PRECIO DE COBERTURA
    // El precio de cobertura se calcula como el PPC menos el porcentaje de price_var
    const priceDecrement = (price_var / 100) * orderCountInCycle;
    const nextCoveragePrice = ppc * (1 - priceDecrement);

    // 2. CÁLCULO DEL MONTO REQUERIDO ESCALADO
    // El monto escala con el size_var por cada orden en el ciclo.
    const sizeIncrement = (size_var / 100) * orderCountInCycle;
    const nextUSDTAmount = parseFloat(purchaseUsdt) * (1 + sizeIncrement);
    
    // 3. Persistir el precio de la próxima orden para el Front-End
    if (botState.lStateData.nextCoveragePrice !== nextCoveragePrice) {
        // SOLUCIÓN DE DEPENDENCIA CIRCULAR: Importamos updateLStateData aquí si es necesario.
        // Si ya hay un proceso activo, no interrumpimos con una importación interna. 
        // Vamos a asumir que el guardado de nextCoveragePrice se hace en el estado central
        // o si los datos del ciclo se actualizaron después de una compra exitosa (handleSuccessfulBuy).
    }

    // 4. Condición de Disparo y Colocación
    if (currentPrice <= nextCoveragePrice) {
        autobotCore.log(`Disparo de cobertura Long activado. Precio objetivo: ${nextCoveragePrice.toFixed(2)} vs Precio actual: ${currentPrice.toFixed(2)}`, 'info');

        if (availableUSDT >= nextUSDTAmount && nextUSDTAmount >= MIN_USDT_VALUE_FOR_BITMART) {
            // Hay fondos, colocar la orden de cobertura
            await placeCoverageBuyOrder(creds, botState, nextUSDTAmount, nextCoveragePrice);

        } else {
            // FONDOS INSUFICIENTES: Transición a NO_COVERAGE

            // SOLUCIÓN DE DEPENDENCIA CIRCULAR: Importamos updateLStateData aquí.
            const { updateLStateData, updateBotState } = require('../../autobotLogic'); 

            // 1. Guardar el monto que se necesitaba para la próxima orden (requiredCoverageAmount).
            botState.lStateData.requiredCoverageAmount = nextUSDTAmount;
            
            // También se recomienda guardar el precio de disparo fallido para el Front-End
            botState.lStateData.nextCoveragePrice = nextCoveragePrice; 

            await updateLStateData(botState.lStateData); // Persiste en la DB

            // 2. Transicionar a NO_COVERAGE.
            autobotCore.log(`Fondos insuficientes para la próxima cobertura (${nextUSDTAmount.toFixed(2)} USDT). Disponible: ${availableUSDT.toFixed(2)} USDT. Cambiando a NO_COVERAGE.`, 'warning');
            await updateBotState('NO_COVERAGE', botState.sstate);
        }
    }
}

module.exports = {
    checkAndPlaceCoverageOrder
};