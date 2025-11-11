// BSB/server/src/utils/coverageLogic.js (CORREGIDO - Lógica de Escalamiento GEOMÉTRICO)

const { placeCoverageBuyOrder } = require('../managers/longOrderManager');
const Autobot = require('../../models/Autobot');
const { MIN_USDT_VALUE_FOR_BITMART } = require('./tradeConstants'); // Asumo que MIN_USDT_VALUE_FOR_BITMART se mueve aquí o se importa correctamente

/**
 * Verifica las condiciones de cobertura y, si es necesario y hay fondos, coloca la orden.
 *
 * @param {object} botState - Objeto de estado del bot (de la DB).
 * @param {number} availableUSDT - USDT disponible en la cuenta.
 * @param {number} currentPrice - Precio actual del mercado.
 * @param {object} creds - Credenciales de la API. // Nota: placeCoverageBuyOrder en longOrderManager.js ya no recibe creds
 * @param {object} config - Configuración del bot.
 * @param {function} log - Función de logging inyectada.
 * @param {function} updateBotState - Función para cambiar el estado inyectada.
 * @param {function} updateLStateData - Función para actualizar lStateData inyectada.
 * @param {function} updateGeneralBotState - Función para actualizar LBalance inyectada. 
 */
async function checkAndPlaceCoverageOrder(botState, availableUSDT, currentPrice, creds, config, log, updateBotState, updateLStateData, updateGeneralBotState) {
    
    // Obtenemos los datos necesarios
    const { ppc, ac, lastOrder, nextCoveragePrice: dbNextCoveragePrice, requiredCoverageAmount } = botState.lStateData;
    const { price_var, size_var, purchaseUsdt } = config.long;

    // Si el bot está en la primera orden o no tiene targets calculados
    if (ppc <= 0 || !dbNextCoveragePrice || dbNextCoveragePrice <= 0) {
        log("Lógica de cobertura: Posición no inicializada o targets no calculados. Esperando estado BUYING.", 'warning');
        return;
    }

    // 💡 USAMOS EL VALOR PERSISTIDO (Fuente única de la verdad, calculado en autobotCalculations.js)
    const nextCoveragePrice = parseFloat(dbNextCoveragePrice);

    // 2. CÁLCULO DEL MONTO REQUERIDO ESCALADO
    // El monto debe ser el *requerido* para la siguiente orden, que ya fue calculado
    // en autobotCalculations.js y guardado como requiredCoverageAmount
    
    // Usamos requiredCoverageAmount como el monto a usar. 
    // Si no existe, usamos la lógica de escalamiento aquí como FALLBACK.
    let nextUSDTAmount = parseFloat(requiredCoverageAmount || 0);

    if (nextUSDTAmount === 0) {
        // Lógica FALLBACK o Primera Orden (Debería venir de requiredCoverageAmount, pero por seguridad...)
        const lastOrderUsdtAmount = parseFloat(lastOrder?.usdt_amount || config.long.purchaseUsdt);
        const baseAmount = lastOrderUsdtAmount;
        nextUSDTAmount = baseAmount * (1 + (size_var / 100));
        
        if (nextUSDTAmount === 0) {
             log("Error crítico: nextUSDTAmount es cero. Cancelando cobertura.", 'error');
             return;
        }
    }

    // 3. Condición de Disparo y Colocación
    if (currentPrice <= nextCoveragePrice) {
        log(`Disparo de cobertura Long activado. Precio objetivo: ${nextCoveragePrice.toFixed(2)} vs Precio actual: ${currentPrice.toFixed(2)}. Monto: ${nextUSDTAmount.toFixed(2)} USDT.`, 'info');

        // 4. Verificación de Fondos (Límite Asignado y Saldo Real)
        const currentLBalance = parseFloat(botState.lbalance || 0);
        const isSufficient = currentLBalance >= nextUSDTAmount && 
                             availableUSDT >= nextUSDTAmount && 
                             nextUSDTAmount >= MIN_USDT_VALUE_FOR_BITMART;

        if (isSufficient) {
            
            // 🛑 NOTA: La deducción atómica del LBalance ahora DEBE ocurrir dentro de placeCoverageBuyOrder
            // para el mecanismo Anti-Carrera (Vimos esto en longOrderManager.js).
            // Si la deducción ocurre aquí, se duplica o se rompe la lógica de reversión.
            
            // 6. Colocar la orden de cobertura
            // 🛑 LÍNEA CORREGIDA para la firma simplificada y el mecanismo anti-carrera
            await placeCoverageBuyOrder(botState, nextUSDTAmount, log, updateGeneralBotState, updateBotState); 
            
            // ELIMINAMOS la lógica de updateGeneralBotState con lastLongOrderId, ya que
            // placeCoverageBuyOrder actualiza lStateData.lastOrder directamente de forma atómica.

        } else {
            // FONDOS INSUFICIENTES: Transición a NO_COVERAGE

            let reason = '';
            if (currentLBalance < nextUSDTAmount) {
                reason = `LÍMITE DE CAPITAL ASIGNADO (LBalance: ${currentLBalance.toFixed(2)} USDT) insuficiente.`;
            } else {
                reason = `Fondos REALES (${availableUSDT.toFixed(2)} USDT) insuficientes.`;
            }
            
            // 7. Persistir los datos de la orden fallida para el Front-End (ya están en lStateData)
            // Solo logeamos y transicionamos.
            
            // 8. Transicionar a NO_COVERAGE.
            log(`No se puede colocar la orden. ${reason} Cambiando a NO_COVERAGE.`, 'warning');
            await updateBotState('NO_COVERAGE', 'long');
        }
    }
}

module.exports = {
    checkAndPlaceCoverageOrder
};