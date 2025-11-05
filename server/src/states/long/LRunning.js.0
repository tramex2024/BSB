// BSB/server/src/states/long/LRunning.js (CORREGIDO - Candado Inmediato)

const analyzer = require('../../bitmart_indicator_analyzer');
const { placeFirstBuyOrder } = require('../../utils/orderManager');

async function run(dependencies) {
    const { botState, currentPrice, availableUSDT, config, log, updateBotState, updateGeneralBotState } = dependencies;
    
    // 💡 1. VERIFICACIÓN DE POSICIÓN (PRIORIDAD AL INICIO)
    if (botState.lStateData.orderCountInCycle > 0) {
        log("Posición detectada (orderCountInCycle > 0). Transicionando a BUYING.", 'info');
        await updateBotState('BUYING', 'long'); 
        return; // Detener la ejecución de RUNNING
    }

    log("Estado Long: RUNNING. Esperando señal de entrada de COMPRA.", 'info');

    // Si no hay posición, procedemos con el análisis.
    const analysisResult = await analyzer.runAnalysis(currentPrice);

    // Tu log muestra que la señal es solo la razón: 
    // [BOT LOG]: ¡Señal de COMPRA detectada! Razón: No se encontraron señales de entrada o salida claras en este momento.
    // Esto es confuso, pero si el analyzer.runAnalysis() está forzando un 'BUY' con esta razón, lo aceptamos.
    if (analysisResult.action === 'BUY') { 
        log(`¡Señal de COMPRA detectada! Razón: ${analysisResult.reason}`, 'success');
        
        // 💡 2. RED DE SEGURIDAD (DOBLE CHEQUEO)
        if (botState.lStateData.orderCountInCycle > 0) {
            log('Red de seguridad activada: orderCountInCycle ya es > 0, cancelando compra duplicada.', 'warning');
            await updateBotState('BUYING', 'long');
            return;
        }

        const purchaseAmount = parseFloat(config.long.purchaseUsdt);
        // Usamos la constante de BitMart para el mínimo
        const MIN_USDT_VALUE_FOR_BITMART = 5.00; 
        
        // ⚠️ VERIFICACIÓN DEL LÍMITE DE CAPITAL (LBalance)
        const currentLBalance = parseFloat(botState.lbalance || 0);

        const isRealBalanceSufficient = availableUSDT >= purchaseAmount && purchaseAmount >= MIN_USDT_VALUE_FOR_BITMART;
        const isCapitalLimitSufficient = currentLBalance >= purchaseAmount;
        
        if (isRealBalanceSufficient && isCapitalLimitSufficient) {
            // Llama a la función que ahora se encargará de:
            // 1. Colocar la orden.
            // 2. Descontar el LBalance.
            // 3. 🛑 Unificar la actualización DB (lStateData + lstate: BUYING).
            await placeFirstBuyOrder(config, log, updateBotState, updateGeneralBotState); 
            
            // 🛑 CRÍTICO: Detener este ciclo para que el bot pase a BUYING en la siguiente iteración.
            return; 
        } else {
            let reason = '';
            if (!isRealBalanceSufficient) {
                reason = `Fondos REALES (${availableUSDT.toFixed(2)} USDT) insuficientes.`;
            } else if (!isCapitalLimitSufficient) {
                reason = `LÍMITE DE CAPITAL ASIGNADO (${currentLBalance.toFixed(2)} USDT) insuficiente.`;
            }

            log(`No se puede iniciar la orden. ${reason} Cambiando a NO_COVERAGE.`, 'warning');
            await updateBotState('NO_COVERAGE', 'long'); 
        }
    }
}

module.exports = { run };