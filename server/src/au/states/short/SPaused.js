//BSB/server/src/au/states/short/SPaused.js

/**
 * S-PAUSED STATE (SHORT):
 * Gestiona la espera cuando el capital es insuficiente para el siguiente DCA.
 * Monitoriza si el precio entra en zona de ganancia para cerrar la posición actual.
 */

const { calculateShortTargets } = require('../../../../autobotCalculations');
const MIN_USDT_VALUE_FOR_BITMART = 5.0;

async function run(dependencies) {
    const { 
        userId, 
        botState, currentPrice, config, 
        updateBotState, updateSStateData,
        updateGeneralBotState, log, 
        availableUSDT: realUSDT 
    } = dependencies;
    
    if (!currentPrice || currentPrice <= 0) return;

    const availableUSDT = parseFloat(realUSDT || 0);
    const currentSBalance = parseFloat(botState.sbalance || 0);

    // Lectura de variables raíz (Acrónimos Short)
    const ac = parseFloat(botState.sac || 0);  // Monedas acumuladas (vendidas)
    const ppc = parseFloat(botState.sppc || 0); // Precio promedio de venta
    const orderCountInCycle = parseInt(botState.socc || 0);
    // Priorizamos el Stop de recompra (PC) si existe, sino el Target Price original
    const targetPrice = parseFloat(botState.spc || botState.stprice || 0);

    // --- 1. LÓGICA DE RECUPERACIÓN (SALIDA A BUYING) ---
    // Si ya tenemos una posición abierta (ac > 0) y el precio cae a zona de profit,
    // saltamos a BUYING para cerrar. No necesitamos capital extra para cerrar un Short.
    if (ac > 0 && targetPrice > 0 && currentPrice <= targetPrice) {
        log(`🚀 [S-RECOVERY] ¡Precio en zona de ganancia (${currentPrice.toFixed(2)})! Saltando a BUYING para cerrar posición.`, 'success');
        await updateBotState('BUYING', 'short'); 
        return;
    }

    // --- 2. RECALCULAR REQUERIMIENTOS ---
    // Recalculamos el costo del siguiente DCA basado en la config actual del usuario
    const recalculation = calculateShortTargets(
        ppc || currentPrice,
        config.short, 
        orderCountInCycle
    );

    const requiredAmount = recalculation.requiredCoverageAmount;

    // Actualizamos los indicadores de la siguiente orden en el documento del usuario
    await updateSStateData({ 
        srca: requiredAmount, 
        sncp: recalculation.nextCoveragePrice 
    });

    // --- 3. RESET DE INDICADORES ---
    // Si no hay posición abierta y el balance no alcanza ni para la primera orden, limpiamos métricas de cobertura
    if (ac <= 0 && currentSBalance < requiredAmount && botState.snorder !== 0) {
        log(`[S-RESET] Limpiando indicadores Short: Balance insuficiente para nueva orden.`, 'warning');
        await updateGeneralBotState({ scoverage: 0, snorder: 0 }); 
        return; 
    }

    // --- 4. VERIFICACIÓN DE REANUDACIÓN ---
    // Verificamos si el usuario ya tiene fondos suficientes en su "bolsa" del bot y en BitMart
    const canResume = currentSBalance >= requiredAmount && 
                      availableUSDT >= requiredAmount && 
                      requiredAmount >= MIN_USDT_VALUE_FOR_BITMART;

    if (canResume) {
        log(`✅ [S-FUNDS] Capital restaurado (${availableUSDT.toFixed(2)} USDT). Reanudando búsqueda en SELLING...`, 'success');
        await updateBotState('SELLING', 'short');
    } else {
        // Heartbeat para el Dashboard: Informa al usuario cuánto le falta para que el bot siga trabajando
        const missing = (requiredAmount - Math.min(availableUSDT, currentSBalance)).toFixed(2);
        log(`[S-PAUSED] ⏸️ Esperando fondos | Necesario: ${requiredAmount.toFixed(2)} | Falta: ${missing} USDT | Orden: #${orderCountInCycle + 1}`, 'debug');
    }
} 

module.exports = { run };