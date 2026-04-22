// BSB/server/src/au/managers/short/shortDataManager.js

const { saveExecutedOrder } = require('../../../services/orderPersistenceService');
const { calculateShortCoverage, parseNumber, getExponentialAmount } = require('../../../autobotCalculations'); 
const { CLEAN_SHORT_ROOT } = require('../utils/cleanState');

const SSTATE = 'short';
const BUY_FEE_PERCENT = 0.001; 

/**
 * Handles the success of a SELL (Short Opening or DCA).
 */
async function handleSuccessfulShortSell(botState, orderDetails, log, dependencies = {}) {
    const { updateGeneralBotState, userId } = dependencies;
    
    const executedQty = parseFloat(orderDetails.filledSize || orderDetails.filled_volume || 0);
    const executedPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
    const baseExecutedValue = executedQty * executedPrice;
    const currentCycleIndex = Number(botState.scycle || 0);

    if (executedQty <= 0 || executedPrice <= 0) {
        log('[S-DATA] ⚠️ Incomplete Short execution data. Retrying audit in the next tick...', 'warning');
        return; 
    }

    const currentSBalance = parseFloat(botState.sbalance || 0);
    const finalizedSBalance = parseFloat((currentSBalance - baseExecutedValue).toFixed(8));

    const currentAC = parseFloat(botState.sac || 0);  
    const currentAI = parseFloat(botState.sai || 0);  
    const currentOCC = parseInt(botState.socc || 0);  
    
    const isFirstOrder = currentOCC === 0;
    
    const newAC = parseFloat((currentAC + executedQty).toFixed(8)); 
    const newAI = currentAI + baseExecutedValue;
    const newPPC = newAI / newAC; 
    const newOCC = currentOCC + 1;

    const profitTrigger = parseNumber(botState.config.short?.profit_percent || 0) / 100;
    const newSTPrice = newPPC * (1 - profitTrigger); 

    const { price_var, size_var, purchaseUsdt, price_step_inc } = botState.config.short || {};
    
    const priceVarDec = parseNumber(price_var || 0) / 100;
    const nextStepMult = Math.pow(1 + (parseNumber(price_step_inc || 0) / 100), newOCC - 1);
    const newNCP = executedPrice * (1 + (priceVarDec * nextStepMult));
    
    const nextRCA = getExponentialAmount(purchaseUsdt, newOCC, size_var);
    
    const { coveragePrice, numberOfOrders } = calculateShortCoverage(
        finalizedSBalance, 
        executedPrice, 
        purchaseUsdt, 
        priceVarDec, 
        parseNumber(size_var),
        newOCC,
        parseNumber(price_step_inc || 0)
    );

    await saveExecutedOrder(
        { ...orderDetails, side: 'sell' }, 
        SSTATE, 
        userId, 
        currentCycleIndex
    );

    await updateGeneralBotState({
        sac: newAC,
        sai: newAI,
        sppc: newPPC,
        socc: newOCC,        
        slep: executedPrice, 
        sncp: newNCP,        
        srca: nextRCA,       
        stprice: newSTPrice,
        spc: 0,              
        spm: 0,              
        sbalance: finalizedSBalance,
        scoverage: coveragePrice, 
        snorder: numberOfOrders,   
        sstartTime: isFirstOrder ? new Date() : botState.sstartTime,
        slastOrder: null     
    });
    
    log(`✅ [S-DATA] #${newOCC} Short. Sell PPC: ${newPPC.toFixed(2)}. Buy Target: $${newSTPrice.toFixed(2)}.`, 'success');
}

/**
 * Handles the success of a BUY (Cycle Closing).
 * IMPLEMENTED LOCK: Uses 'sac' validation (like Long strategy) to prevent duplicate cycle logs.
 */
async function handleSuccessfulShortBuy(botStateObj, orderDetails, dependencies) {
    const { userId, config, log, updateBotState, updateGeneralBotState, logSuccessfulCycle } = dependencies;
    
    try {
        // --- 🛡️ ANTI-DUPLICATE SHIELD (REPLICATING LONG LOGIC) ---
        const totalBtcToCover = parseFloat(botStateObj.sac || 0);
        if (totalBtcToCover <= 0) {
            // If sac is 0, another process already cleared this cycle. Exit immediately.
            return; 
        }

        const buyPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
        const currentCycleIndex = Number(botStateObj.scycle || 0);
        
        const totalUsdtReceivedFromSales = parseFloat(botStateObj.sai || 0); 
        const totalSpentToCover = (totalBtcToCover * buyPrice) * (1 + BUY_FEE_PERCENT);
        const profitNeto = totalUsdtReceivedFromSales - totalSpentToCover;

        // Persist the order
        try {
            await saveExecutedOrder({ 
                ...orderDetails, 
                side: 'buy',
                status: 'filled',
                filledSize: totalBtcToCover,
                priceAvg: buyPrice,
                timestamp: Date.now()
            }, SSTATE, userId, currentCycleIndex);
        } catch (saveError) {
            log(`⚠️ Error persisting Short buy: ${saveError.message}`, 'error');
        }

        // Log the successful cycle only if sstartTime exists
        if (logSuccessfulCycle && botStateObj.sstartTime) {
            try {
                await logSuccessfulCycle({
                    userId, 
                    autobotId: botStateObj._id,
                    symbol: botStateObj.config?.symbol || 'BTC_USDT',
                    strategy: 'Short',
                    cycleIndex: currentCycleIndex + 1,
                    startTime: botStateObj.sstartTime,
                    endTime: new Date(),
                    averagePPC: parseFloat(botStateObj.sppc || 0),
                    finalSellPrice: buyPrice, 
                    orderCount: parseInt(botStateObj.socc || 0),
                    initialInvestment: totalUsdtReceivedFromSales,
                    finalRecovery: totalSpentToCover,
                    netProfit: profitNeto,
                    profitPercentage: totalUsdtReceivedFromSales > 0 ? (profitNeto / totalUsdtReceivedFromSales) * 100 : 0
                });
            } catch (e) { log(`⚠️ Error logging short cycle history.`, 'error'); }
        }

        const finalizedSBalance = parseFloat(((parseFloat(botStateObj.sbalance) || 0) + totalUsdtReceivedFromSales + profitNeto).toFixed(8));
        const shouldStopShort = config.short?.stopAtCycle === true;

        // Final database update: Reset state using CLEAN_SHORT_ROOT
        await updateGeneralBotState({
            ...CLEAN_SHORT_ROOT,
            sbalance: finalizedSBalance,
            total_profit: (parseFloat(botStateObj.total_profit) || 0) + profitNeto,
            scycle: currentCycleIndex + 1,
            'config.short.enabled': !shouldStopShort
        });

        log(`💰 [S-DATA] Short Cycle Closed: +${profitNeto.toFixed(2)} USDT.`, 'success');
        
        await updateBotState(shouldStopShort ? 'STOPPED' : 'SELLING', SSTATE);

    } catch (error) {
        log(`❌ [S-DATA] Short closing failed: ${error.message}`, 'error');
        throw error;
    }
}

module.exports = { handleSuccessfulShortSell, handleSuccessfulShortBuy };