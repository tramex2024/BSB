// BSB/server/src/au/states/long/LongDataManager.js

const { saveExecutedOrder } = require('../../../services/orderPersistenceService');
const { logSuccessfulCycle } = require('../../../services/cycleLogService');
const { calculateLongCoverage, parseNumber, getExponentialAmount } = require('../../../autobotCalculations');
const { CLEAN_LONG_ROOT } = require('../utils/cleanState');

const LSTATE = 'long';
const SELL_FEE_PERCENT = 0.001; // 0.1% BitMart Fee

/**
 * Procesa el éxito de una compra Long (Apertura o DCA).
 * Actualiza promedios y proyecta el siguiente escalón exponencial.
 */
async function handleSuccessfulBuy(botState, orderDetails, log, dependencies = {}) {
    const { updateGeneralBotState } = dependencies;
    
    const executedQty = parseFloat(orderDetails.filledSize || 0);
    const executedPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
    const baseExecutedValue = executedQty * executedPrice;

    if (executedQty <= 0 || executedPrice <= 0) {
        log('[L-DATA] ⚠️ Ejecución inválida capturada por el consolidador.', 'error');
        await updateGeneralBotState({ llastOrder: null });
        return;
    }

    // --- 1. CÁLCULOS DE ACUMULADOS ---
    const currentBalance = parseFloat(botState.lbalance || 0);
    const finalizedLBalance = parseFloat((currentBalance - baseExecutedValue).toFixed(8));

    const isFirstOrder = (botState.locc || 0) === 0;
    
    const newTotalQty = parseFloat(((botState.lac || 0) + executedQty).toFixed(8)); 
    const newAI = (botState.lai || 0) + baseExecutedValue;
    const newPPC = newAI / newTotalQty; 
    const newOrderCount = (botState.locc || 0) + 1;

    // --- 2. PROYECCIÓN EXPONENCIAL Y TARGETS ---
    // 🎯 CAMBIO: Usamos profit_percent (1.3%) y guardamos en ltprice
    const profitPercent = parseNumber(botState.config.long?.profit_percent || botState.config.long?.trigger || 0) / 100;
    const newLTPrice = newPPC * (1 + profitPercent); 

    const { price_var, size_var, purchaseUsdt, price_step_inc } = botState.config.long || {};
    
    const priceVarDec = parseNumber(price_var || 0) / 100;
    const nextStepMult = Math.pow(1 + (parseNumber(price_step_inc || 0) / 100), newOrderCount - 1);
    const newNextPrice = executedPrice * (1 - (priceVarDec * nextStepMult));
    
    const nextRequiredAmount = getExponentialAmount(purchaseUsdt, newOrderCount, size_var);
    
    // --- 3. COBERTURA / RESISTENCIA REAL ---
    const { coveragePrice, numberOfOrders } = calculateLongCoverage(
        finalizedLBalance, 
        executedPrice, 
        purchaseUsdt, 
        priceVarDec, 
        parseNumber(size_var || 0),
        newOrderCount,
        parseNumber(price_step_inc || 0)
    );

    // Persistencia en DB
    await saveExecutedOrder({ ...orderDetails, side: 'buy' }, LSTATE);

    // ✅ ACTUALIZACIÓN ATÓMICA EN RAÍZ
    await updateGeneralBotState({
        lbalance: finalizedLBalance,
        lac: newTotalQty,        
        lai: newAI,             
        lppc: newPPC,           
        locc: newOrderCount,    
        ltprice: newLTPrice,    // Objetivo de activación
        lpc: 0,                 // 🧹 Limpieza de Trailing
        lpm: 0,                 // 🧹 Limpieza de Trailing
        lncp: newNextPrice,     
        lrca: nextRequiredAmount, 
        lcoverage: coveragePrice, 
        lnorder: numberOfOrders, 
        llep: executedPrice,    
        llastOrder: null,       
        lstartTime: isFirstOrder ? new Date() : botState.lstartTime
    });

    log(`✅ [L-DATA] #${newOrderCount} Long. PPC: ${newPPC.toFixed(2)}. Target: ${newLTPrice.toFixed(2)}. Balance: $${finalizedLBalance.toFixed(2)}`, 'success');
}

/**
 * Procesa el cierre de ciclo (Take Profit) del Long.
 * Actualizada para persistir la orden de venta en el historial local.
 */
async function handleSuccessfulSell(botStateObj, orderDetails, dependencies) {
    const { config, log, updateBotState, updateGeneralBotState, logSuccessfulCycle } = dependencies;
    
    try {
        const totalBtcToSell = parseFloat(botStateObj.lac || 0);
        const sellPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
        
        const totalUsdtReceived = (totalBtcToSell * sellPrice) * (1 - SELL_FEE_PERCENT);
        const totalInvestment = parseFloat(botStateObj.lai || 0);
        const profitNeto = totalUsdtReceived - totalInvestment;

        // 🚀 NUEVO: Guardar la orden de venta en el historial de órdenes (Persistence Service)
        // Esto garantiza que la venta aparezca en el Dashboard junto con las compras.
        try {
            await saveExecutedOrder({ 
                ...orderDetails, 
                side: 'sell', 
                status: 'filled',
                filledSize: totalBtcToSell,
                priceAvg: sellPrice,
                timestamp: Date.now()
            }, LSTATE);
        } catch (saveError) {
            log(`⚠️ Error al persistir orden de venta en BD: ${saveError.message}`, 'error');
        }

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
                log(`⚠️ Error al guardar historial de Ciclo Long: ${dbError.message}`, 'error');
            }
        }

        const newLBalance = parseFloat((botStateObj.lbalance + totalUsdtReceived).toFixed(8));
        const shouldStopLong = config.long?.stopAtCycle === true;

        // ✅ RESET TOTAL A RAÍZ
        await updateGeneralBotState({
    ...CLEAN_LONG_ROOT, 
    lbalance: newLBalance, // Este valor es vital mantenerlo
    total_profit: (parseFloat(botStateObj.total_profit) || 0) + profitNeto,
    lcycle: (Number(botStateObj.lcycle || 0) + 1),
    'config.long.enabled': !shouldStopLong 
});
        
        log(`💰 [L-DATA] Ciclo Long Cerrado: +${profitNeto.toFixed(2)} USDT.`, 'success');
        
        await updateBotState(shouldStopLong ? 'STOPPED' : 'BUYING', LSTATE);

    } catch (error) {
        log(`🔥 [CRITICAL] Fallo en handleSuccessfulSell: ${error.message}`, 'error');
        throw error;
    }
}

module.exports = { handleSuccessfulBuy, handleSuccessfulSell };