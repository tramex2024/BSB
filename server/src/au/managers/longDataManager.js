// BSB/server/src/au/states/long/LongDataManager.js (MIGRADO A RAÍZ)

const { saveExecutedOrder } = require('../../../services/orderPersistenceService');
const { logSuccessfulCycle } = require('../../../services/cycleLogService');
const { calculateLongCoverage, parseNumber, getExponentialAmount } = require('../../../autobotCalculations');
const { CLEAN_LONG_ROOT } = require('../utils/cleanState');

const LSTATE = 'long';
const SELL_FEE_PERCENT = 0.001; 

/**
 * Procesa el éxito de una compra Long (DCA o Inicial).
 * Actualiza balances y proyecta el siguiente nivel exponencial en la raíz.
 */
async function handleSuccessfulBuy(botState, orderDetails, log, dependencies = {}) {
    const { updateGeneralBotState } = dependencies;
    
    const executedQty = parseFloat(orderDetails.filledSize || 0);
    const executedPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
    const baseExecutedValue = executedQty * executedPrice;

    if (executedQty <= 0 || executedPrice <= 0) {
        log('[L-DATA] ⚠️ Ejecución inválida.', 'error');
        await updateGeneralBotState({ llastOrder: null });
        return;
    }

    // --- 1. CÁLCULOS DE ACUMULADOS EN RAÍZ ---
    const currentBalance = parseFloat(botState.lbalance || 0);
    const finalizedLBalance = parseFloat((currentBalance - baseExecutedValue).toFixed(8));

    const isFirstOrder = (botState.locc || 0) === 0;
    
    const newTotalQty = parseFloat(((botState.lac || 0) + executedQty).toFixed(8)); 
    const newAI = (botState.lai || 0) + baseExecutedValue;
    const newPPC = newAI / newTotalQty;
    const newOrderCount = (botState.locc || 0) + 1;

    // --- 2. PROYECCIÓN EXPONENCIAL ---
    const profitPercent = parseNumber(botState.config.long?.trigger || 0) / 100;
    const newLTPrice = newPPC * (1 + profitPercent);

    const { price_var, size_var, purchaseUsdt, price_step_inc } = botState.config.long || {};
    const newNextPrice = executedPrice * (1 - (parseNumber(price_var || 0) / 100));
    const nextRequiredAmount = getExponentialAmount(purchaseUsdt, newOrderCount, size_var);
    
    // --- 3. COBERTURA / RESISTENCIA ---
    const { coveragePrice, numberOfOrders } = calculateLongCoverage(
        finalizedLBalance, 
        executedPrice, 
        purchaseUsdt, 
        parseNumber(price_var || 0) / 100, 
        parseNumber(size_var || 0),
        newOrderCount,
        parseNumber(price_step_inc || 0)
    );

    await saveExecutedOrder({ ...orderDetails, side: 'buy' }, LSTATE);

    // ✅ ACTUALIZACIÓN ATÓMICA EN RAÍZ
    await updateGeneralBotState({
        lbalance: finalizedLBalance,
        lac: newTotalQty,
        lai: newAI,
        lppc: newPPC,
        locc: newOrderCount,
        ltprice: newLTPrice,
        lncp: newNextPrice,     // Next Coverage Price
        lrca: nextRequiredAmount, // Required Coverage Amount
        lcoverage: coveragePrice,
        lnorder: numberOfOrders,
        llep: executedPrice,    // Last Execution Price
        llastOrder: null,
        lstartTime: isFirstOrder ? new Date() : botState.lstartTime
    });

    log(`✅ [L-DATA] Buy #${newOrderCount} ok. PPC: ${newPPC.toFixed(2)}. Balance: $${finalizedLBalance.toFixed(2)}`, 'success');
}

/**
 * Procesa el cierre de ciclo (Take Profit) del Long.
 */
async function handleSuccessfulSell(botStateObj, orderDetails, dependencies) {
    const { 
        config, log, updateBotState, 
        updateGeneralBotState, logSuccessfulCycle 
    } = dependencies;
    
    try {
        const totalBtcToSell = parseFloat(botStateObj.lac || 0);
        const sellPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
        
        const totalUsdtReceived = (totalBtcToSell * sellPrice) * (1 - SELL_FEE_PERCENT);
        const totalInvestment = parseFloat(botStateObj.lai || 0);
        const profitNeto = totalUsdtReceived - totalInvestment;

        // Registro Histórico
        if (logSuccessfulCycle && botStateObj.lstartTime) {
            try {
                await logSuccessfulCycle({
                    autobotId: botStateObj._id,
                    symbol: botStateObj.config.symbol || 'BTC_USDT',
                    strategy: 'Long',
                    cycleIndex: (botStateObj.lcycle || 0) + 1,
                    startTime: botStateObj.lstartTime,
                    endTime: new Date(),
                    averagePPC: parseFloat(botStateObj.lppc || 0),
                    finalSellPrice: sellPrice,
                    orderCount: parseInt(botStateObj.locc || 0),
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

        // ✅ RESET TOTAL A RAÍZ (Usando CLEAN_LONG_ROOT)
        await updateGeneralBotState({
            ...CLEAN_LONG_ROOT,
            lbalance: newLBalance,
            total_profit: (parseFloat(botStateObj.total_profit) || 0) + profitNeto,
            lcycle: (Number(botStateObj.lcycle || 0) + 1),
            'config.long.enabled': !shouldStopLong 
        });
        
        log(`💰 [L-DATA] Ciclo Long #${botStateObj.lcycle + 1} cerrado: +${profitNeto.toFixed(2)} USDT.`, 'success');
        
        await updateBotState(shouldStopLong ? 'STOPPED' : 'BUYING', LSTATE);

    } catch (error) {
        log(`🔥 [CRITICAL] Fallo en handleSuccessfulSell: ${error.message}`, 'error');
        throw error;
    }
}

module.exports = { handleSuccessfulBuy, handleSuccessfulSell };