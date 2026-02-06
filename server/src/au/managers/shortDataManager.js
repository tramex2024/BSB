// BSB/server/src/au/managers/shortDataManager.js

const { saveExecutedOrder } = require('../../../services/orderPersistenceService');
const { logSuccessfulCycle } = require('../../../services/cycleLogService');
const { calculateShortCoverage, parseNumber, getExponentialAmount } = require('../../../autobotCalculations'); 
const { CLEAN_STRATEGY_DATA, CLEAN_SHORT_ROOT } = require('../utils/cleanState');

const SSTATE = 'short';
const BUY_FEE_PERCENT = 0.001; 

/**
 * Maneja el éxito de una VENTA (Apertura o DCA).
 * Actualizada con lógica exponencial dinámica y nueva estructura de DB.
 */
async function handleSuccessfulShortSell(botState, orderDetails, log, dependencies = {}) {
    const { updateGeneralBotState, updateSStateData } = dependencies;
    
    const executedQty = parseFloat(orderDetails.filledSize || 0);
    const executedPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
    const baseExecutedValue = executedQty * executedPrice;

    if (executedQty <= 0 || executedPrice <= 0) {
        log('[S-DATA] ⚠️ Ejecución Short inválida.', 'error');
        if (updateSStateData) await updateSStateData({ 'lastOrder': null });
        return;
    }

    // --- 1. SANEAMIENTO DE BALANCE ---
    const currentSBalance = parseFloat(botState.sbalance || 0);
    const finalizedSBalance = parseFloat((currentSBalance - baseExecutedValue).toFixed(8));

    const currentSData = botState.sStateData || {};
    const isFirstOrder = (currentSData.orderCountInCycle || 0) === 0;
    
    const currentTotalQty = isFirstOrder ? 0 : parseFloat(currentSData.ac || 0);
    const currentAI = isFirstOrder ? 0 : parseFloat(currentSData.ai || 0);
    
    const newTotalQty = parseFloat((currentTotalQty + executedQty).toFixed(8)); 
    const newAI = currentAI + baseExecutedValue;
    const newPPC = newAI / newTotalQty;
    const newOrderCount = (currentSData.orderCountInCycle || 0) + 1;

    // --- 2. CÁLCULO DE TARGETS (Ajustado a config.short) ---
    // ✅ CORRECCIÓN: Usamos 'trigger' de la nueva DB
    const profitTrigger = parseNumber(botState.config.short?.trigger || 0) / 100;
    const newSTPrice = newPPC * (1 - profitTrigger);

    const { price_var, size_var, purchaseUsdt } = botState.config.short || {};
    
    // El precio de la próxima cobertura (DCA)
    const newNextPrice = executedPrice * (1 + (parseNumber(price_var) / 100));

    // LÓGICA EXPONENCIAL: Calcula el monto de la siguiente orden
    const nextRequiredAmount = getExponentialAmount(purchaseUsdt, newOrderCount, size_var);
    
    // --- 3. CÁLCULO DE COBERTURA RESTANTE (Resistencia de la billetera) ---
    const { coveragePrice, numberOfOrders } = calculateShortCoverage(
        finalizedSBalance, 
        executedPrice, 
        purchaseUsdt, 
        parseNumber(price_var) / 100, 
        parseNumber(size_var),
        newOrderCount
    );

    // --- 4. PERSISTENCIA Y ACTUALIZACIÓN ---
    await saveExecutedOrder({ ...orderDetails, side: 'sell' }, SSTATE);

    await updateGeneralBotState({
        scoverage: coveragePrice,
        snorder: numberOfOrders,
        sbalance: finalizedSBalance,
        stprice: newSTPrice,
        sStateData: {
            ...currentSData,
            ac: newTotalQty,
            ai: newAI,
            ppc: newPPC,
            lastOrder: null,
            lastExecutionPrice: executedPrice,
            nextCoveragePrice: newNextPrice,
            requiredCoverageAmount: nextRequiredAmount,
            orderCountInCycle: newOrderCount,
            cycleStartTime: isFirstOrder ? new Date() : currentSData.cycleStartTime
        }
    });
    
    log(`✅ [S-DATA] #${newOrderCount} Short. Nuevo Bal: ${finalizedSBalance.toFixed(2)}. TP: ${newSTPrice.toFixed(2)}`, 'success');
}

/**
 * Maneja el éxito de una COMPRA (Take Profit).
 */
async function handleSuccessfulShortBuy(botStateObj, orderDetails, dependencies) {
    const { 
        config, log, updateBotState, updateSStateData, 
        updateGeneralBotState, logSuccessfulCycle 
    } = dependencies;
    
    try {
        const currentSData = botStateObj.sStateData || {};
        const buyPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
        const filledSize = parseFloat(orderDetails.filledSize || 0); 
        
        const totalUsdtReceivedFromSales = parseFloat(currentSData.ai || 0); 
        const totalSpentToCover = (filledSize * buyPrice) * (1 + BUY_FEE_PERCENT);
        const profitNeto = totalUsdtReceivedFromSales - totalSpentToCover;

        // Recuperamos el balance + el profit generado
        const finalizedSBalance = parseFloat(((parseFloat(botStateObj.sbalance) || 0) + totalUsdtReceivedFromSales + profitNeto).toFixed(8));

        await saveExecutedOrder({ ...orderDetails, side: 'buy' }, SSTATE);

        // --- REGISTRO DE CICLO ---
        if (logSuccessfulCycle && currentSData.cycleStartTime) {
            try {
                await logSuccessfulCycle({
                    autobotId: botStateObj._id,
                    symbol: botStateObj.config?.symbol || 'BTC_USDT',
                    strategy: 'Short',
                    cycleIndex: (botStateObj.scycle || 0) + 1,
                    startTime: currentSData.cycleStartTime,
                    endTime: new Date(),
                    averagePPC: parseFloat(currentSData.ppc || 0),
                    finalSellPrice: buyPrice,
                    orderCount: parseInt(currentSData.orderCountInCycle || 0),
                    initialInvestment: totalUsdtReceivedFromSales,
                    finalRecovery: totalSpentToCover,
                    netProfit: profitNeto,
                    profitPercentage: (profitNeto / totalUsdtReceivedFromSales) * 100
                });
            } catch (dbError) {
                log(`⚠️ Error al guardar historial Short: ${dbError.message}`, 'error');
            }
        }

        const shouldStopShort = config.short?.stopAtCycle === true;

        // Limpiamos datos del ciclo y actualizamos totales
        await updateGeneralBotState({
            ...CLEAN_SHORT_ROOT,
            sbalance: finalizedSBalance,
            total_profit: (parseFloat(botStateObj.total_profit) || 0) + profitNeto,
            scycle: (Number(botStateObj.scycle || 0) + 1),
            'config.short.enabled': !shouldStopShort 
        });

        await updateSStateData(CLEAN_STRATEGY_DATA);

        log(`💰 [S-DATA] Ciclo Short Cerrado. Profit: +${profitNeto.toFixed(2)} USDT.`, 'success');
        
        // Si stopAtCycle es true, el bot pasa a STOPPED, si no, vuelve a RUNNING para buscar otra señal
        await updateBotState(shouldStopShort ? 'STOPPED' : 'RUNNING', SSTATE);

    } catch (error) {
        log(`❌ [S-DATA] Error crítico en cierre Short: ${error.message}`, 'error');
        if (updateSStateData) await updateSStateData({ 'lastOrder': null });
        throw error;
    }
}

module.exports = { handleSuccessfulShortSell, handleSuccessfulShortBuy };