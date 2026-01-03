// BSB/server/src/au/states/short/SNoCoverage.js (ESPEJO DE LNoCoverage.js)

const MIN_USDT_VALUE_FOR_BITMART = 5.0;
const { calculateShortTargets } = require('../../../../autobotCalculations');

async function run(dependencies) {
    const { 
        botState, currentPrice, config, 
        updateBotState, updateSStateData,
        getBotState, updateGeneralBotState, 
        log 
    } = dependencies;
    
    const availableUSDT = parseFloat(dependencies.availableUSDT || 0);
    const { ac } = botState.sStateData;
    
    // --- 1. VERIFICACIÓN DE VENTA (Take Profit en Short es COMPRA) ---
    // En Short, el TP está por DEBAJO del precio actual.
    const targetBuyPrice = botState.stprice || 0; 
    if (currentPrice <= targetBuyPrice && ac > 0 && targetBuyPrice > 0) {
        log(`[S] Precio alcanzó objetivo de recompra (${targetBuyPrice.toFixed(2)}) desde NO_COVERAGE.`, 'success');
        await updateBotState('BUYING', 'short'); // Transiciona al estado de cierre (SBuying)
        return;
    }

    // --- 2. RECUPERACIÓN DE ESTADO ---
    let latestBotState = botState;
    if (getBotState) {
        try {
            latestBotState = await getBotState();
        } catch (error) {
            console.error(`[S-DB ERROR] No se pudo recargar estado: ${error.message}`);
        }
    }
    
    // --- 3. RECALCULO DE REQUERIMIENTOS ---
    let requiredAmount = latestBotState.sStateData.requiredCoverageAmount || config.short.purchaseUsdt || 0;
    
    if (ac > 0 && latestBotState.sStateData.orderCountInCycle >= 0) { 
        // Espejamos el cálculo usando las funciones de Short
        const recalculation = calculateShortTargets(
            latestBotState.sStateData.ppc || 0,
            config.short.profit_percent || 0,
            config.short.price_var || 0,
            config.short.size_var || 0,
            config.short.purchaseUsdt || 0,
            latestBotState.sStateData.orderCountInCycle || 0,
            latestBotState.sbalance || 0
        );
        requiredAmount = recalculation.requiredCoverageAmount;
        await updateSStateData({ 
            requiredCoverageAmount: requiredAmount, 
            nextCoveragePrice: recalculation.nextCoveragePrice 
        });
    }

    // --- 4. RESETEO CRÍTICO DE SNORDER ---
    const currentSBalance = parseFloat(latestBotState.sbalance || 0);

    if (ac <= 0 && currentSBalance < requiredAmount && latestBotState.snorder !== 0) {
        await updateGeneralBotState({ scoverage: 0, snorder: 0 }); 
        log(`[SHORT] RESET: snorder a 0. Balance (${currentSBalance.toFixed(2)}) < Requerido (${requiredAmount.toFixed(2)})`, 'warning');
        return; 
    }
    
    // --- 5. LOG DE ESTADO Y TRANSICIÓN ---
    const safeRequiredAmountDiag = requiredAmount && !isNaN(requiredAmount) ? requiredAmount.toFixed(2) : '0.00';
    log(`[S] NO_COVERAGE: Balance Short: ${currentSBalance.toFixed(2)} | Requerido: ${safeRequiredAmountDiag}`, 'info');

    // Si recuperamos balance (por depósito o transferencia), volvemos a SELLING (donde se abren/cubren shorts)
    if (currentSBalance >= requiredAmount && availableUSDT >= requiredAmount && requiredAmount >= MIN_USDT_VALUE_FOR_BITMART) {
        try {
            log(`[S] ¡Fondos Short restaurados! Pasando a SELLING. (Real: ${availableUSDT.toFixed(2)})`, 'success');
            await updateBotState('SELLING', 'short');
        } catch (error) {
            log(`[S] Error al pasar a SELLING: ${error.message}`, 'error');
        }
    } 
} 

module.exports = { run };