// BSB/server/src/utils/coverageLogicShort.js (INVERTIDO Y COMPLETO CON CONSUMO DE SBALANCE)

const { getOrderDetail } = require('../../services/bitmartService');
const { placeCoverageSellOrder, MIN_USDT_VALUE_FOR_BITMART } = require('./orderManager');
// NOTA: Asumimos que la contraparte de placeCoverageBuyOrder es placeCoverageSellOrder

/**
 * Verifica las condiciones de cobertura Short (Venta de BTC) y, si es necesario y hay capital, coloca la orden.
 *
 * @param {object} botState - Objeto de estado del bot (de la DB).
 * @param {number} availableBTC - BTC disponible en la cuenta (balance real del exchange).
 * @param {number} currentPrice - Precio actual del mercado.
 * @param {object} creds - Credenciales de la API.
 * @param {object} config - Configuración del bot.
 * @param {function} log - Función de logging inyectada.
 * @param {function} updateBotState - Función para cambiar el estado inyectada.
 * @param {function} updateSStateData - Función para actualizar sStateData inyectada. 
 * @param {function} updateGeneralBotState - Función para actualizar campos generales (SBalance) inyectada.
 */
async function checkAndPlaceCoverageOrderShort(botState, availableBTC, currentPrice, creds, config, log, updateBotState, updateSStateData, updateGeneralBotState) {
    
    // Usamos sStateData y ppv (Precio Promedio de Venta)
    const { ppv, orderCountInCycle } = botState.sStateData; 
    const { price_var, size_var, sellBtc } = config.short; // sellBtc es el capital base en BTC

    // Solo procedemos si ya hay una posición (PPV > 0)
    if (ppv <= 0) {
        return;
    }

    // 1. CÁLCULO DEL PRÓXIMO PRECIO DE COBERTURA
    // Invertido: El precio de cobertura (Venta) se calcula como el PPV más el porcentaje de price_var
    const priceIncrement = (price_var / 100) * orderCountInCycle;
    const nextCoveragePrice = ppv * (1 + priceIncrement); 

    // 2. CÁLCULO DEL MONTO REQUERIDO ESCALADO
    // El monto escala con el size_var. Usamos BTC.
    const sizeIncrement = (size_var / 100) * orderCountInCycle;
    const nextBTCAmount = parseFloat(sellBtc) * (1 + sizeIncrement);
    const nextUSDTValue = nextBTCAmount * currentPrice; // Valor en USDT para la validación de BitMart

    // 3. Condición de Disparo (Price UP)
    if (currentPrice >= nextCoveragePrice) {
        log(`Disparo de cobertura Short activado. Precio objetivo (Venta): ${nextCoveragePrice.toFixed(2)} vs Precio actual: ${currentPrice.toFixed(2)}`, 'info');

        // --- A. VALIDACIÓN DE CAPITAL OPERATIVO (SBalance) ---
        // CRÍTICO: ¿El capital operativo restante (SBalance) es suficiente para la próxima orden (nextBTCAmount)?
        if (botState.sbalance < nextBTCAmount) {
            
            // 1. Guardar los datos de fallo y la cantidad que se necesitaba.
            botState.sStateData.requiredCoverageAmount = nextBTCAmount;
            botState.sStateData.nextCoveragePrice = nextCoveragePrice; 
            await updateSStateData(botState.sStateData); 

            // 2. Transicionar a NO_COVERAGE.
            log(`FONDOS BTC AGOTADOS. SBalance (${botState.sbalance.toFixed(8)} BTC) es insuficiente para la orden de ${nextBTCAmount.toFixed(8)} BTC. Cambiando a NO_COVERAGE.`, 'warning');
            await updateBotState('NO_COVERAGE', 'short');
            return; // Detener la ejecución
        }

        // --- B. VALIDACIÓN DE SALDO REAL DEL EXCHANGE ---
        if (availableBTC >= nextBTCAmount && nextUSDTValue >= MIN_USDT_VALUE_FOR_BITMART) {
            
            // --- 4. CONSUMO DE CAPITAL OPERATIVO (SBalance) ---
            const newSBalance = botState.sbalance - nextBTCAmount;
            await updateGeneralBotState({ sbalance: newSBalance });
            log(`SBalance consumido: Se restó ${nextBTCAmount.toFixed(8)} BTC. SBalance restante: ${newSBalance.toFixed(8)} BTC.`, 'info');

            // 5. COLOCACIÓN DE LA ORDEN DE VENTA LÍMITE (COBERTURA)
            await placeCoverageSellOrder(botState, creds, nextBTCAmount, nextCoveragePrice, log);

        } else {
            // FONDOS REALES INSUFICIENTES O MONTO MÍNIMO NO ALCANZADO (Aunque SBalance fuera suficiente)

            // 1. Guardar los datos de fallo.
            botState.sStateData.requiredCoverageAmount = nextBTCAmount;
            botState.sStateData.nextCoveragePrice = nextCoveragePrice; 
            await updateSStateData(botState.sStateData); 

            // 2. Transicionar a NO_COVERAGE.
            log(`Fondos reales insuficientes en BitMart o monto mínimo (${nextUSDTValue.toFixed(2)} USDT) no alcanzado. Disponible: ${availableBTC.toFixed(8)} BTC. Cambiando a NO_COVERAGE.`, 'warning');
            await updateBotState('NO_COVERAGE', 'short');
        }
    }
}

module.exports = {
    checkAndPlaceCoverageOrderShort
};