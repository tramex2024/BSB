// BSB/server/src/states/long/LNoCoverage.js

const MIN_USDT_VALUE_FOR_BITMART = 5.0;
const { calculateLongTargets } = require('../../../autobotCalculations');

async function run(dependencies) {
    const { 
        botState, currentPrice, config, 
        updateBotState, updateLStateData,
        getBotState, updateGeneralBotState, 
        log 
    } = dependencies;
    
    const availableUSDT = parseFloat(dependencies.availableUSDT || 0);
    const { ac } = botState.lStateData;
    
    // --- 1. VERIFICACIÓN DE VENTA ---
    const targetSellPrice = botState.ltprice || 0; 
    if (currentPrice >= targetSellPrice && ac > 0 && targetSellPrice > 0) {
        log(`Precio actual alcanzó el objetivo de venta (${targetSellPrice.toFixed(2)}) desde NO_COVERAGE.`, 'success');
        await updateBotState('SELLING', 'long'); 
        return;
    }

    // --- 2. RECUPERACIÓN DE ESTADO ---
    let latestBotState = botState;
    if (getBotState) {
        try {
            latestBotState = await getBotState();
        } catch (error) {
            console.error(`[DB ERROR] No se pudo recargar estado: ${error.message}`);
        }
    }
    
    // --- 3. RECALCULO DE REQUERIMIENTOS Y LNORDER ---
    let requiredAmount = latestBotState.lStateData.requiredCoverageAmount || config.long.purchaseUsdt || 0;
    let calculatedLNOrder = latestBotState.lnorder; // Por defecto el actual
    
    if (ac > 0 && latestBotState.lStateData.orderCountInCycle >= 0) { 
        const recalculation = calculateLongTargets(
            latestBotState.lStateData.ppc || 0,
            config.long.profit_percent || 0,
            config.long.price_var || 0,
            config.long.size_var || 0,
            config.long.purchaseUsdt || 0,
            latestBotState.lStateData.orderCountInCycle || 0,
            latestBotState.lbalance || 0
        );
        
        requiredAmount = recalculation.requiredCoverageAmount;
        calculatedLNOrder = recalculation.lNOrderMax; // Capturamos el LNorder real

        // Actualizamos lStateData y sincronizamos LNorder en la misma llamada
        await updateGeneralBotState({ 
            "lStateData.requiredCoverageAmount": requiredAmount, 
            "lStateData.nextCoveragePrice": recalculation.nextCoveragePrice,
            "lnorder": calculatedLNOrder 
        });
    }

    // --- 4. 🛑 RESETEO CRÍTICO DE LNORDER (CORREGIDO) ---
    const currentLBalance = parseFloat(latestBotState.lbalance || 0);

    // Eliminada la restricción de ac <= 0 para permitir el reseteo si el balance es insuficiente
    if (currentLBalance < requiredAmount && latestBotState.lnorder !== 0) {
        await updateGeneralBotState({ lcoverage: 0, lnorder: 0 }); 
        log(`[LONG] RESET: lnorder a 0. Balance (${currentLBalance.toFixed(2)}) < Requerido (${requiredAmount.toFixed(2)})`, 'warning');
        // Actualizamos la variable local para el log de abajo
        calculatedLNOrder = 0;
    }
    
    // --- 5. LOG DE ESTADO Y TRANSICIÓN ---
    const safeRequiredAmountDiag = requiredAmount && !isNaN(requiredAmount) ? requiredAmount.toFixed(2) : '0.00';
    log(`[L] NO_COVERAGE: Bal: ${currentLBalance.toFixed(2)} | Req: ${safeRequiredAmountDiag} | LNorder: ${calculatedLNOrder}`, 'info');

    if (currentLBalance >= requiredAmount && availableUSDT >= requiredAmount && requiredAmount >= MIN_USDT_VALUE_FOR_BITMART) {
        try {
            log(`¡Fondos listos! Pasando a BUYING. (Real: ${availableUSDT.toFixed(2)})`, 'success');
            await updateBotState('BUYING', 'long');
        } catch (error) {
            log(`Error al pasar a BUYING: ${error.message}`, 'error');
        }
    } 
} 

module.exports = { run };