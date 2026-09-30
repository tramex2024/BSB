/**
 * BSB/server/src/managers/long/LongDataManager.js
 * LONG DATA MANAGER:
 * Processes successful buy and sell orders for the Long strategy.
 * Soporta API BitMart V4, firmas polimórficas de llamadas y mitigación de errores.
 */

const { saveExecutedOrder } = require('../../services/orderPersistenceService');
const { calculateLongCoverage, parseNumber, getExponentialAmount } = require('../../autobotCalculations');
const { CLEAN_LONG_ROOT } = require('../../utils/cleanState');
const { TRADE_SYMBOL, SELL_FEE_PERCENT } = require('../../utils/tradeConstants');

const LSTATE = 'long';

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
 * Processes the success of a Long Buy (Opening or DCA).
 */
async function handleSuccessfulBuy(botState, orderDetails, arg3, arg4) {
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

    // ENFORCED SECURITY: If volume or price is invalid, do NOT clear llastOrder.
    if (executedQty <= 0 || executedPrice <= 0 || isNaN(baseExecutedValue)) {
        log('[L-DATA] ⚠️ Invalid or incomplete execution. Keeping order for audit retry.', 'warning');
        return; 
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
    const longConfig = botState?.config?.long || {};
    const profitPercent = parseNumber(longConfig.profit_percent || 0) / 100;
    const newLTPrice = newPPC * (1 + profitPercent); 

    const { price_var, size_var, purchaseUsdt, price_step_inc } = longConfig;
    
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
    try {
        await saveExecutedOrder(
            { ...orderDetails, side: 'buy' }, 
            LSTATE, 
            userId, 
            currentCycleIndex
        );
    } catch (saveError) {
        log(`⚠️ [L-DATA] Error persisting buy order: ${saveError.message}`, 'error');
    }

    // DB UPDATE: Only reached if there is real data (>0)
    if (updateGeneralBotState) {
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
    }

    log(`✅ [L-DATA] #${newOrderCount} Long. PPC: ${newPPC.toFixed(2)}. Target: ${newLTPrice.toFixed(2)}.`, 'success');
}

/**
 * Processes the Long cycle closing (Take Profit).
 */
async function handleSuccessfulSell(botStateObj, orderDetails, arg3, arg4) {
    const { log, dependencies } = resolveHandlerArgs(arg3, arg4);
    const { userId, config, updateBotState, updateGeneralBotState, logSuccessfulCycle } = dependencies;
    
    try {
        const totalBtcToSell = parseFloat(botStateObj.lac || 0);
        if (totalBtcToSell <= 0) {
            // If there are no coins left, another process already closed this cycle.
            return; 
        }

        let sellPrice = parseFloat(
            orderDetails?.price_avg || 
            orderDetails?.priceAvg || 
            orderDetails?.price || 0
        );

        const notional = parseFloat(
            orderDetails?.notional || 
            orderDetails?.filled_notional || 
            orderDetails?.filledNotional || 0
        );

        if ((!sellPrice || isNaN(sellPrice) || sellPrice <= 0) && notional > 0 && totalBtcToSell > 0) {
            sellPrice = notional / totalBtcToSell;
        }

        if (sellPrice <= 0 || isNaN(sellPrice)) {
            log('[L-DATA] ⚠️ Invalid sell price. Retrying consolidation in next tick.', 'warning');
            return;
        }

        const effectiveFee = typeof SELL_FEE_PERCENT === 'number' ? SELL_FEE_PERCENT : 0.001;
        const totalUsdtReceived = (totalBtcToSell * sellPrice) * (1 - effectiveFee);
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
                    symbol: botStateObj.config?.symbol || TRADE_SYMBOL,
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
                log(`⚠️ Error saving Long Cycle history: ${dbError.message}`, 'error');
            }
        }

        const newLBalance = parseFloat(((botStateObj.lbalance || 0) + totalUsdtReceived).toFixed(8));
        const activeConfig = config || botStateObj.config || {};
        const shouldStopLong = activeConfig.long?.stopAtCycle === true;

        if (updateGeneralBotState) {
            await updateGeneralBotState({
                ...CLEAN_LONG_ROOT, 
                lbalance: newLBalance,
                total_profit: (parseFloat(botStateObj.total_profit) || 0) + profitNeto,
                lcycle: currentCycleIndex + 1,
                'config.long.enabled': !shouldStopLong 
            });
        }
        
        log(`💰 [L-DATA] Long Cycle Closed: +${profitNeto.toFixed(2)} USDT.`, 'success');
        
        if (updateBotState) {
            await updateBotState(shouldStopLong ? 'STOPPED' : 'BUYING', LSTATE);
        }

    } catch (error) {
        log(`🔥 [CRITICAL] Long closing failed: ${error.message}`, 'error');
        throw error;
    }
}

module.exports = { handleSuccessfulBuy, handleSuccessfulSell };