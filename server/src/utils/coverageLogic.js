// BSB/server/src/utils/coverageLogic.js (CORREGIDO - Lógica de Escalamiento GEOMÉTRICO)

const { placeCoverageBuyOrder, MIN_USDT_VALUE_FOR_BITMART } = require('./orderManager');
const Autobot = require('../../models/Autobot'); 

/**
 * Verifica las condiciones de cobertura y, si es necesario y hay fondos, coloca la orden.
 *
 * @param {object} botState - Objeto de estado del bot (de la DB).
 * @param {number} availableUSDT - USDT disponible en la cuenta.
 * @param {number} currentPrice - Precio actual del mercado.
 * @param {object} creds - Credenciales de la API.
 * @param {object} config - Configuración del bot.
 * @param {function} log - Función de logging inyectada.
 * @param {function} updateBotState - Función para cambiar el estado inyectada.
 * @param {function} updateLStateData - Función para actualizar lStateData inyectada.
 * @param {function} updateGeneralBotState - Función para actualizar LBalance inyectada. 
 */
async function checkAndPlaceCoverageOrder(botState, availableUSDT, currentPrice, creds, config, log, updateBotState, updateLStateData, updateGeneralBotState) {
    
    // Obtenemos los datos necesarios para la lógica geométrica (basada en la orden anterior)
    const { ppc, ac, lastOrder } = botState.lStateData;
    const { price_var, size_var, purchaseUsdt } = config.long;

    if (ppc <= 0 || !lastOrder || !lastOrder.price) {
        log("Lógica de cobertura: Posición no inicializada o incompleta.", 'warning');
        return;
    }

    const lastOrderPrice = parseFloat(lastOrder.price); // Precio de la última compra
    
    // 💡 CRÍTICO: Usamos el monto en USDT de la última orden para el escalamiento.
    // Usamos 'purchaseUsdt' como fallback si por alguna razón no está registrado.
    const lastOrderUsdtAmount = parseFloat(lastOrder.usdt_amount || config.long.purchaseUsdt);

    // 1. CÁLCULO DEL PRÓXIMO PRECIO DE COBERTURA (Referencia al precio de la ORDEN ANTERIOR)
    // Formula: Precio Anterior * (1 - (Decremento / 100))
    const nextCoveragePrice = lastOrderPrice * (1 - (price_var / 100));

    // 2. CÁLCULO DEL MONTO REQUERIDO ESCALADO (Referencia al monto de la ORDEN ANTERIOR)
    // Formula: Monto Anterior * (1 + (Incremento / 100))
    const baseAmount = lastOrderUsdtAmount; 
    const nextUSDTAmount = baseAmount * (1 + (size_var / 100));
    
    // 3. Condición de Disparo y Colocación
    if (currentPrice <= nextCoveragePrice) {
        log(`Disparo de cobertura Long activado. Precio objetivo: ${nextCoveragePrice.toFixed(2)} vs Precio actual: ${currentPrice.toFixed(2)}. Monto: ${nextUSDTAmount.toFixed(2)} USDT.`, 'info');

        // 4. Verificación de Fondos (Límite Asignado y Saldo Real)
        const currentLBalance = parseFloat(botState.lbalance || 0);
        const isSufficient = currentLBalance >= nextUSDTAmount && 
                             availableUSDT >= nextUSDTAmount && 
                             nextUSDTAmount >= MIN_USDT_VALUE_FOR_BITMART;

        if (isSufficient) {
            
            // 5. RESTA DE CAPITAL ASIGNADO (LBalance)
            const newLBalance = currentLBalance - nextUSDTAmount;
            await updateGeneralBotState({ lbalance: newLBalance });
            log(`LBalance asignado reducido en ${nextUSDTAmount.toFixed(2)} USDT para cobertura. Nuevo balance: ${newLBalance.toFixed(2)} USDT.`, 'info');

            // 6. Colocar la orden de cobertura
            await placeCoverageBuyOrder(botState, creds, nextUSDTAmount, nextCoveragePrice, log); 

            // === [ CAMBIO CLAVE: Almacenar el ID de la orden ] ===
if (orderId) {
    // ASUMO que updateGeneralBotState puede actualizar un campo llamado lastLongOrderId
    await updateGeneralBotState({ lastLongOrderId: orderId }); 
    log(`ID de orden de cobertura capturado: ${orderId}`, 'info');
} else {
    log('Advertencia: placeCoverageBuyOrder no devolvió un ID de orden. Riesgo de inconsistencia.', 'warning');
}
// ======================================================   
        } else {
            // FONDOS INSUFICIENTES: Transición a NO_COVERAGE

            let reason = '';
            if (currentLBalance < nextUSDTAmount) {
                reason = `LÍMITE DE CAPITAL ASIGNADO (LBalance: ${currentLBalance.toFixed(2)} USDT) insuficiente.`;
            } else {
                reason = `Fondos REALES (${availableUSDT.toFixed(2)} USDT) insuficientes.`;
            }
            
            // 7. Persistir los datos de la orden fallida para el Front-End
            botState.lStateData.requiredCoverageAmount = nextUSDTAmount;
            botState.lStateData.nextCoveragePrice = nextCoveragePrice; 
            await updateLStateData(botState.lStateData); 

            // 8. Transicionar a NO_COVERAGE.
            log(`No se puede colocar la orden. ${reason} Cambiando a NO_COVERAGE.`, 'warning');
            await updateBotState('NO_COVERAGE', 'long');
        }
    }
}

module.exports = {
    checkAndPlaceCoverageOrder
};