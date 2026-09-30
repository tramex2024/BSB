/**
 * BSB/server/src/au/managers/short/shortDataManager.js
 * SHORT DATA MANAGER:
 * Processes successful sell and buy orders for the Short strategy.
 * Soporta API BitMart V4, firmas polimórficas de llamadas y mitigación de errores.
 */

const { saveExecutedOrder } = require('../../services/orderPersistenceService');
const { calculateShortCoverage, parseNumber, getExponentialAmount } = require('../../autobotCalculations'); 
const { CLEAN_SHORT_ROOT } = require('../../utils/cleanState');
const { TRADE_SYMBOL, BUY_FEE_PERCENT } = require('../../utils/tradeConstants');

const SSTATE = 'short';

/**
 * Normaliza y resuelve los argumentos pasados a los handlers para evitar
 * fallos de firma cuando se llama con (botState, orderDetails, log, deps)
 * o con (botState, orderDetails, deps).
 */
function resolveHandlerArgs(arg3, arg4) {
    let log, dependencies;
    if (typeof arg3 === 'function') {
        log = arg3;
        dependencies = arg4 || {};
    } else if (arg3 && typeof arg3 === 'object') {
        dependencies = arg3;
        log = dependencies.log || console.log;
    } else {
        log = console.log;
        dependencies = arg4 || {};
    }
    return { log, dependencies };
}

/**
 * Handles the success of a SELL (Short Opening or DCA).
 */
async function handleSuccessfulShortSell(botState, orderDetails, arg3, arg4) {
    const { log, dependencies } = resolveHandlerArgs(arg3, arg4);
    const { updateGeneralBotState, userId } = dependencies;
    
    // Normalización de campos para API BitMart V2/V4 / Websocket
    const executedQty = parseFloat(
        orderDetails?.filled_size ||
        orderDetails?.filledSize ||
        orderDetails?.filled_volume ||
        orderDetails?.filledVolume ||
        orderDetails?.size || 0
    );

    let executedPrice = parseFloat(
        orderDetails?.price_avg ||
        orderDetails?.priceAvg ||
        orderDetails?.price || 0
    );

    const notional = parseFloat(
        orderDetails?.notional ||
        orderDetails?.filled_notional ||
        orderDetails?.filledNotional || 0
    );

    if ((!executedPrice || isNaN(executedPrice) || executedPrice <= 0) && notional > 0 && executedQty > 0) {
        executedPrice = notional / executedQty;
    }

    const baseExecutedValue = executedQty * executedPrice;
    const currentCycleIndex = Number(botState.scycle || 0);

    // ENFORCED SECURITY: If volume or price is invalid, exit without modifying state.
    if (executedQty <= 0 || executedPrice <= 0 || isNaN(baseExecutedValue)) {
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

    const shortConfig = botState?.config?.short || {};
    const profitTrigger = parseNumber(shortConfig.profit_percent || 0) / 100;
    const newSTPrice = newPPC * (1 - profitTrigger); 

    const { price_var, size_var, purchaseUsdt, price_step_inc } = shortConfig;
    
    const priceVarDec = parseNumber(price_var || 0) / 100;
    const nextStepMult = Math.pow(1 + (parseNumber(price_step_inc || 0) / 100), newOCC - 1);
    const newNCP = executedPrice * (1 + (priceVarDec * nextStepMult));
    
    const nextRCA = getExponentialAmount(purchaseUsdt, newOCC, size_var);
    
    const { coveragePrice, numberOfOrders } = calculateShortCoverage(
        finalizedSBalance, 
        executedPrice, 
        purchaseUsdt, 
        priceVarDec, 
        parseNumber(size_var || 0),
        newOCC,
        parseNumber(price_step_inc || 0)
    );

    try {
        await saveExecutedOrder(
            { ...orderDetails, side: 'sell' }, 
            SSTATE, 
            userId, 
            currentCycleIndex
        );
    } catch (saveError) {
        log(`⚠️️ [S-DATA] Error persisting Short sell order: ${saveError.message}`, 'error');
    }

    if (updateGeneralBotState) {
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
    }
    
    log(`✅ [S-DATA] #${newOCC} Short. Sell PPC: ${newPPC.toFixed(2)}. Buy Target: $${newSTPrice.toFixed(2)}.`, 'success');
}

/**
 * Handles the success of a BUY (Cycle Closing).
 * IMPLEMENTED LOCK: Uses 'sac' validation (like Long strategy) to prevent duplicate cycle logs.
 */
async function handleSuccessfulShortBuy(botStateObj, orderDetails, arg3, arg4) {
    const { log, dependencies } = resolveHandlerArgs(arg3, arg4);
    const { userId, config, updateBotState, updateGeneralBotState, logSuccessfulCycle } = dependencies;
    
    try {
        // --- 🛡️ ANTI-DUPLICATE SHIELD (REPLICATING LONG LOGIC) ---
        const totalBtcToCover = parseFloat(botStateObj.sac || 0);
        if (totalBtcToCover <= 0) {
            // If sac is 0, another process already cleared this cycle. Exit immediately.
            return; 
        }

        let buyPrice = parseFloat(
            orderDetails?.price_avg || 
            orderDetails?.priceAvg || 
            orderDetails?.price || 0
        );

        const notional = parseFloat(
            orderDetails?.notional || 
            orderDetails?.filled_notional || 
            orderDetails?.filledNotional || 0
        );

        if ((!buyPrice || isNaN(buyPrice) || buyPrice <= 0) && notional > 0 && totalBtcToCover > 0) {
            buyPrice = notional / totalBtcToCover;
        }

        if (buyPrice <= 0 || isNaN(buyPrice)) {
            log('[S-DATA] ⚠️ Invalid Short buy price. Retrying consolidation in next tick.', 'warning');
            return;
        }

        const currentCycleIndex = Number(botStateObj.scycle || 0);
        
        const totalUsdtReceivedFromSales = parseFloat(botStateObj.sai || 0); 
        const effectiveFee = typeof BUY_FEE_PERCENT === 'number' ? BUY_FEE_PERCENT : 0.001;
        const totalSpentToCover = (totalBtcToCover * buyPrice) * (1 + effectiveFee);
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
                    symbol: botStateObj.config?.symbol || TRADE_SYMBOL,
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
            } catch (e) { 
                log(`⚠️ Error logging short cycle history: ${e.message}`, 'error'); 
            }
        }

        const finalizedSBalance = parseFloat(((parseFloat(botStateObj.sbalance) || 0) + totalUsdtReceivedFromSales + profitNeto).toFixed(8));
        const activeConfig = config || botStateObj.config || {};
        const shouldStopShort = activeConfig.short?.stopAtCycle === true;

        // Final database update: Reset state using CLEAN_SHORT_ROOT
        if (updateGeneralBotState) {
            await updateGeneralBotState({
                ...CLEAN_SHORT_ROOT,
                sbalance: finalizedSBalance,
                total_profit: (parseFloat(botStateObj.total_profit) || 0) + profitNeto,
                scycle: currentCycleIndex + 1,
                'config.short.enabled': !shouldStopShort
            });
        }

        log(`💰 [S-DATA] Short Cycle Closed: +${profitNeto.toFixed(2)} USDT.`, 'success');
        
        if (updateBotState) {
            await updateBotState(shouldStopShort ? 'STOPPED' : 'SELLING', SSTATE);
        }

    } catch (error) {
        log(`❌ [S-DATA] Short closing failed: ${error.message}`, 'error');
        throw error;
    }
}

module.exports = { handleSuccessfulShortSell, handleSuccessfulShortBuy };