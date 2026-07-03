/**
 * BSB/server/src/au/states/short/SPaused.js
 * Gestión de la espera cuando el capital es insuficiente para el siguiente DCA.
 * Corregido: Sincronización de cobertura con precio de mercado real (2026).
 */

const { calculateShortTargets, calculateShortCoverage } = require('../../../autobotCalculations');
const MIN_USDT_VALUE_FOR_BITMART = 5.0;

async function run(dependencies) {
    const { 
        userId, 
        botState, currentPrice, config, 
        updateBotState, updateSStateData,
        updateGeneralBotState, log, 
        availableUSDT: realUSDT 
    } = dependencies;
    
    // SOLUCIÓN: Envoltura global para evitar congelamientos por errores de cálculo o datos nulos
    try {
        if (!currentPrice || currentPrice <= 0) return;

        const availableUSDT = parseFloat(realUSDT || 0);
        const currentSBalance = parseFloat(botState.sbalance || 0);

        const ac = parseFloat(botState.sac || 0);  // Monedas vendidas (posición Short abierta)
        const ppc = parseFloat(botState.sppc || 0); // Precio promedio de venta
        const orderCountInCycle = parseInt(botState.socc || 0);
        
        // Priorizamos el Stop de recompra (PC) del Trailing si existe
        const targetPrice = parseFloat(botState.spc || botState.stprice || 0);

        // --- 1. LÓGICA DE RECUPERACIÓN (SALIDA A BUYING) ---
        // Si el precio cae a zona de profit, podemos cerrar independientemente del balance
        if (ac > 0 && targetPrice > 0 && currentPrice <= targetPrice) {
            log(`🚀 [S-RECOVERY] Precio en zona de profit (${currentPrice.toFixed(2)}). Saltando a BUYING para cerrar posición.`, 'success');
            await updateBotState('BUYING', 'short'); 
            return;
        }

        // --- 2. RECALCULAR REQUERIMIENTOS Y PROYECCIÓN ---
        const recalculation = calculateShortTargets(
            ppc || currentPrice,
            config.short, 
            orderCountInCycle
        );

        const requiredAmount = parseFloat(recalculation.requiredCoverageAmount || 0);

        // SOLUCIÓN: Sanitización de variables mediante parseo seguro para evitar colapsos por datos vacíos
        const priceVar = parseFloat(config.short?.price_var || 0) / 100;
        const priceStepInc = parseFloat(config.short?.price_step_inc || 0) / 100;
        const initialPurchaseAmount = parseFloat(config.short?.purchaseUsdt || 0);

        const coverageInfo = calculateShortCoverage(
            currentSBalance,
            currentPrice, 
            initialPurchaseAmount,
            priceVar,
            parseFloat(config.short?.size_var || 0),
            orderCountInCycle,
            priceStepInc
        );

        // Actualizamos indicadores Short para limpiar valores basura de la DB
        await updateGeneralBotState({ 
            srca: requiredAmount, 
            sncp: recalculation.nextCoveragePrice,
            scoverage: coverageInfo.coveragePrice,
            snorder: coverageInfo.numberOfOrders
        });

        // --- 3. RESET DE INDICADORES (Si no hay posición y no hay fondos) ---
        if (ac <= 0 && currentSBalance < (initialPurchaseAmount || MIN_USDT_VALUE_FOR_BITMART)) {
            if (parseFloat(botState.scoverage || 0) !== 0) {
                log(`[S-RESET] Sin fondos para nueva apertura Short. Limpiando proyección visual.`, 'warning');
                await updateGeneralBotState({ scoverage: 0, snorder: 0 }); 
            }
            return; 
        }

        // --- 4. VERIFICACIÓN DE REANUDACIÓN (SOLUCIÓN AL COMPORTAMIENTO LOCKUP) ---
        // Si el ciclo está limpio (ac === 0) requerimos el monto inicial; si ya hay DCA pendiente, requerimos requiredAmount
        const amountNeededToResume = ac === 0 ? initialPurchaseAmount : requiredAmount;
        const finalMinLimit = Math.max(MIN_USDT_VALUE_FOR_BITMART, amountNeededToResume);

        const canResume = currentSBalance >= amountNeededToResume && 
                          availableUSDT >= amountNeededToResume && 
                          finalMinLimit >= MIN_USDT_VALUE_FOR_BITMART;

        if (canResume) {
            log(`✅ [S-FUNDS] Capital recuperado (${amountNeededToResume.toFixed(2)} USDT necesarios). Reanudando en SELLING...`, 'success');
            await updateBotState('SELLING', 'short');
        } else {
            // Reemplazado console.log silencioso por una trazabilidad estandarizada
            const missing = (amountNeededToResume - Math.min(availableUSDT, currentSBalance)).toFixed(2);
            log(`[S-PAUSED] 👁️ Esperando fondos. Balance: ${currentSBalance.toFixed(2)} USDT | Requerido: ${amountNeededToResume.toFixed(2)} USDT (Faltan: ${missing} USDT)`, 'debug');
        }
    } catch (criticalError) {
        log(`🔥 [CRITICAL] Error inesperado dentro del estado SPaused: ${criticalError.message}`, 'error');
    }
} 

module.exports = { run };