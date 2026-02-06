const { saveExecutedOrder } = require('../../../services/orderPersistenceService');
const { logSuccessfulCycle } = require('../../../services/cycleLogService');
const { calculateLongCoverage, parseNumber, getExponentialAmount } = require('../../../autobotCalculations');
const { CLEAN_STRATEGY_DATA, CLEAN_LONG_ROOT } = require('../utils/cleanState');

const LSTATE = 'long';
const SELL_FEE_PERCENT = 0.001; 

/**
 * Procesa el éxito de una compra Long, actualizando balances, 
 * acumulados y proyectando el siguiente nivel exponencial.
 */
async function handleSuccessfulBuy(botState, orderDetails, log, dependencies = {}) {
    const { updateGeneralBotState, updateLStateData } = dependencies;
    
    const executedQty = parseFloat(orderDetails.filledSize || 0);
    const executedPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
    const baseExecutedValue = executedQty * executedPrice;

    if (executedQty <= 0 || executedPrice <= 0) {
        log('[L-DATA] ⚠️ Ejecución inválida.', 'error');
        if (updateLStateData) await updateLStateData({ 'lastOrder': null });
        return;
    }

    // --- 1. SANEAMIENTO DE BALANCE ---
    const currentBalance = parseFloat(botState.lbalance || 0);
    const finalizedLBalance = parseFloat((currentBalance - baseExecutedValue).toFixed(8));

    const currentLData = botState.lStateData || {};
    const isFirstOrder = (currentLData.orderCountInCycle || 0) === 0;
    
    const currentTotalQty = isFirstOrder ? 0 : parseFloat(currentLData.ac || 0);
    const currentAI = isFirstOrder ? 0 : parseFloat(currentLData.ai || 0);
    
    const newTotalQty = parseFloat((currentTotalQty + executedQty).toFixed(8)); 
    const newAI = currentAI + baseExecutedValue;
    const newPPC = newAI / newTotalQty;
    const newOrderCount = (currentLData.orderCountInCycle || 0) + 1;

    // --- 2. CÁLCULO DE TARGETS (Ajustado a nueva jerarquía) ---
    // ✅ Cambio: profit_percent ahora es trigger
    const profitPercent = parseNumber(botState.config.long?.trigger || 0) / 100;
    const newLTPrice = newPPC * (1 + profitPercent);

    const { price_var, size_var, purchaseUsdt } = botState.config.long || {};
    const newNextPrice = executedPrice * (1 - (parseNumber(price_var || 0) / 100));
    
    // El monto de la siguiente orden se calcula con la lógica exponencial
    const nextRequiredAmount = getExponentialAmount(purchaseUsdt, newOrderCount, size_var);
    
    // --- 3. COBERTURA REAL ---
    const { coveragePrice, numberOfOrders } = calculateLongCoverage(
        finalizedLBalance, 
        executedPrice, 
        purchaseUsdt, 
        parseNumber(price_var || 0) / 100, 
        parseNumber(size_var || 0), // Lógica exponencial pura
        newOrderCount
    );

    await saveExecutedOrder({ ...orderDetails, side: 'buy' }, LSTATE);

    await updateGeneralBotState({
        lcoverage: coveragePrice,
        lnorder: numberOfOrders,
        lbalance: finalizedLBalance,
        ltprice: newLTPrice,
        lStateData: {
            ...currentLData,
            ac: newTotalQty,
            ai: newAI,
            ppc: newPPC,
            lastOrder: null,
            lastExecutionPrice: executedPrice,
            requiredCoverageAmount: nextRequiredAmount,
            nextCoveragePrice: newNextPrice,
            orderCountInCycle: newOrderCount,
            cycleStartTime: isFirstOrder ? new Date() : currentLData.cycleStartTime
        }
    });

    log(`✅ [L-DATA] Balance: $${finalizedLBalance.toFixed(2)}. Target TP: ${newLTPrice.toFixed(2)}.`, 'success');
}

async function handleSuccessfulSell(botStateObj, orderDetails, dependencies) {
    const { 
        config, log, updateBotState, updateLStateData, 
        updateGeneralBotState, logSuccessfulCycle 
    } = dependencies;
    
    try {
        const currentLData = botStateObj.lStateData || {};
        
        const totalBtcToSell = parseFloat(currentLData.ac || 0);
        const sellPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
        
        const totalUsdtReceived = (totalBtcToSell * sellPrice) * (1 - SELL_FEE_PERCENT);
        const totalInvestment = parseFloat(currentLData.ai || 0);
        const profitNeto = totalUsdtReceived - totalInvestment;

        // Registro en historial
        if (logSuccessfulCycle && currentLData.cycleStartTime) {
            try {
                await logSuccessfulCycle({
                    autobotId: botStateObj._id,
                    symbol: botStateObj.config.symbol || 'BTC_USDT',
                    strategy: 'Long',
                    cycleIndex: (botStateObj.lcycle || 0) + 1,
                    startTime: currentLData.cycleStartTime,
                    endTime: new Date(),
                    averagePPC: parseFloat(currentLData.ppc || 0),
                    finalSellPrice: sellPrice,
                    orderCount: parseInt(currentLData.orderCountInCycle || 0),
                    initialInvestment: totalInvestment,
                    finalRecovery: totalUsdtReceived,
                    netProfit: profitNeto,
                    profitPercentage: totalInvestment > 0 ? (profitNeto / totalInvestment) * 100 : 0
                });
            } catch (dbError) {
                log(`⚠️ Error historial: ${dbError.message}`, 'error');
            }
        }

        const newLBalance = parseFloat((botStateObj.lbalance + totalUsdtReceived).toFixed(8));
        const shouldStopLong = config.long?.stopAtCycle === true;

        // Limpieza y reseteo para el siguiente ciclo
        await updateGeneralBotState({
            ...CLEAN_LONG_ROOT,
            lbalance: newLBalance,
            total_profit: (parseFloat(botStateObj.total_profit) || 0) + profitNeto,
            lcycle: (Number(botStateObj.lcycle || 0) + 1),
            'config.long.enabled': !shouldStopLong 
        });

        await updateLStateData(CLEAN_STRATEGY_DATA);
        
        log(`💰 [L-DATA] Venta finalizada: +${profitNeto.toFixed(2)} USDT.`, 'success');
        
        // El bot se mantiene en BUYING de forma autónoma a menos que stopAtCycle sea true
        await updateBotState(shouldStopLong ? 'STOPPED' : 'BUYING', LSTATE);

    } catch (error) {
        log(`🔥 [CRITICAL] Fallo en handleSuccessfulSell: ${error.message}`, 'error');
        throw error;
    }
}

module.exports = { handleSuccessfulBuy, handleSuccessfulSell };