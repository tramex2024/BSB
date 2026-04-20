// BSB/server/src/au/managers/long/LongDataManager.js

const { saveExecutedOrder } = require('../../../services/orderPersistenceService');
const { calculateLongCoverage, parseNumber, getExponentialAmount } = require('../../../autobotCalculations');
const { CLEAN_LONG_ROOT } = require('../utils/cleanState');

const LSTATE = 'long';
const SELL_FEE_PERCENT = 0.001; // 0.1% BitMart Fee

/**
 * Processes the success of a Long Buy (Opening or DCA).
 */
async function handleSuccessfulBuy(botState, orderDetails, log, dependencies = {}) {
    const { updateGeneralBotState, userId } = dependencies; 
    
    const executedQty = parseFloat(orderDetails.filledSize || orderDetails.filled_volume || 0);
    const executedPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
    const baseExecutedValue = executedQty * executedPrice;

    // ENFORCED SECURITY: If volume is 0, we throw an error and DO NOT clear llastOrder.
    // This forces the bot to retry consolidation in the next tick.
    if (executedQty <= 0 || executedPrice <= 0) {
        log('[L-DATA] ⚠️ Invalid or incomplete execution. Keeping order for audit retry.', 'warning');
        return; // Exit without executing updateGeneralBotState({ llastOrder: null })
    }

    // --- 1. ACCUMULATED CALCULATIONS ---
    const currentBalance = parseFloat(botState.lbalance || 0);
    const finalizedLBalance = parseFloat((currentBalance - baseExecutedValue).toFixed(8));

    const isFirstOrder = (botState.locc || 0) === 0;
    
    const newTotalQty = parseFloat(((botState.lac || 0) + executedQty).toFixed(8)); 
    const newAI = (botState.lai || 0) + baseExecutedValue;
    const newPPC = newAI / newTotalQty; 
    const newOrderCount = (botState.locc || 0) + 1;

    // --- 2. EXPONENTIAL PROJECTION AND TARGETS ---
    const profitPercent = parseNumber(botState.config.long?.profit_percent || 0) / 100;
    const newLTPrice = newPPC * (1 + profitPercent); 

    const { price_var, size_var, purchaseUsdt, price_step_inc } = botState.config.long || {};
    
    const priceVarDec = parseNumber(price_var || 0) / 100;
    const nextStepMult = Math.pow(1 + (parseNumber(price_step_inc || 0) / 100), newOrderCount - 1);
    const newNextPrice = executedPrice * (1 - (priceVarDec * nextStepMult));
    
    const nextRequiredAmount = getExponentialAmount(purchaseUsdt, newOrderCount, size_var);
    
    // --- 3. COVERAGE / REAL RESISTANCE ---
    const { coveragePrice, numberOfOrders } = calculateLongCoverage(
        finalizedLBalance, 
        executedPrice, 
        purchaseUsdt, 
        priceVarDec, 
        parseNumber(size_var || 0),
        newOrderCount,
        parseNumber(price_step_inc || 0)
    );

    const currentCycleIndex = Number(botState.lcycle || 0);
    await saveExecutedOrder(
        { ...orderDetails, side: 'buy' }, 
        LSTATE, 
        userId, 
        currentCycleIndex
    );

    // DB UPDATE: Only reached if there is real data (>0)
    await updateGeneralBotState({
        lbalance: finalizedLBalance,
        lac: newTotalQty,        
        lai: newAI,             
        lppc: newPPC,           
        locc: newOrderCount,    
        ltprice: newLTPrice,   
        lpc: 0,                 
        lpm: 0,                 
        lncp: newNextPrice,     
        lrca: nextRequiredAmount, 
        lcoverage: coveragePrice, 
        lnorder: numberOfOrders, 
        llep: executedPrice,    
        llastOrder: null,       
        lstartTime: isFirstOrder ? new Date() : botState.lstartTime
    });

    log(`✅ [L-DATA] #${newOrderCount} Long. PPC: ${newPPC.toFixed(2)}. Target: ${newLTPrice.toFixed(2)}.`, 'success');
}

/**
 * Processes the Long cycle closing (Take Profit).
 */
async function handleSuccessfulSell(botStateObj, orderDetails, dependencies) {
    const { userId, config, log, updateBotState, updateGeneralBotState, logSuccessfulCycle } = dependencies;
    
    try {
        const totalBtcToSell = parseFloat(botStateObj.lac || 0);
        const sellPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
        
        const totalUsdtReceived = (totalBtcToSell * sellPrice) * (1 - SELL_FEE_PERCENT);
        const totalInvestment = parseFloat(botStateObj.lai || 0);
        const profitNeto = totalUsdtReceived - totalInvestment;
        const currentCycleIndex = Number(botStateObj.lcycle || 0);

        try {
            await saveExecutedOrder({ 
                ...orderDetails, 
                side: 'sell', 
                status: 'filled',
                filledSize: totalBtcToSell,
                priceAvg: sellPrice,
                timestamp: Date.now()
            }, LSTATE, userId, currentCycleIndex);
        } catch (saveError) {
            log(`⚠️ Error persisting sale: ${saveError.message}`, 'error');
        }

        if (logSuccessfulCycle && botStateObj.lstartTime) {
            try {
                await logSuccessfulCycle({
                    userId,
                    autobotId: botStateObj._id,
                    symbol: botStateObj.config.symbol || 'BTC_USDT',
                    strategy: 'Long',
                    cycleIndex: currentCycleIndex + 1,
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
                log(`⚠️ Error saving Long Cycle history.`, 'error');
            }
        }

        const newLBalance = parseFloat((botStateObj.lbalance + totalUsdtReceived).toFixed(8));
        const shouldStopLong = config.long?.stopAtCycle === true;

        await updateGeneralBotState({
            ...CLEAN_LONG_ROOT, 
            lbalance: newLBalance,
            total_profit: (parseFloat(botStateObj.total_profit) || 0) + profitNeto,
            lcycle: currentCycleIndex + 1,
            'config.long.enabled': !shouldStopLong 
        });
        
        log(`💰 [L-DATA] Long Cycle Closed: +${profitNeto.toFixed(2)} USDT.`, 'success');
        
        // REPAIR: Transition to BUYING for cycle continuity, instead of RUNNING
        await updateBotState(shouldStopLong ? 'STOPPED' : 'BUYING', LSTATE);

    } catch (error) {
        log(`🔥 [CRITICAL] Long closing failed: ${error.message}`, 'error');
        throw error;
    }
}

module.exports = { handleSuccessfulBuy, handleSuccessfulSell };