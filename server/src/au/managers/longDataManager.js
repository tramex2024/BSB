// BSB/server/src/au/managers/longDataManager.js

const { saveExecutedOrder } = require('../../../services/orderPersistenceService');
const { logSuccessfulCycle } = require('../../../services/cycleLogService');
const { calculateLongCoverage, parseNumber } = require('../../../autobotCalculations');
const { CLEAN_STRATEGY_DATA, CLEAN_LONG_ROOT } = require('../utils/cleanState');

const LSTATE = 'long';
const SELL_FEE_PERCENT = 0.001; 

/**
 * Maneja una COMPRA exitosa (Apertura o DCA de Long).
 */
async function handleSuccessfulBuy(botState, orderDetails, log, dependencies = {}) {
    const { updateGeneralBotState, updateLStateData } = dependencies;

    const executedQty = parseFloat(orderDetails.filledSize || 0);
    const executedPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
    const baseExecutedValue = executedQty * executedPrice;

    if (executedQty <= 0 || executedPrice <= 0) {
        log('[L-DATA] ⚠️ Ejecución inválida. Limpiando bloqueo.', 'error');
        if (updateLStateData) await updateLStateData({ 'lastOrder': null });
        return;
    }

    const currentLData = botState.lStateData;
    const isFirstOrder = (currentLData.orderCountInCycle || 0) === 0;
    
    const currentTotalQty = isFirstOrder ? 0 : parseFloat(currentLData.ac || 0);
    const currentAI = isFirstOrder ? 0 : parseFloat(currentLData.ai || 0);
    
    const newTotalQty = currentTotalQty + executedQty;
    const newAI = currentAI + baseExecutedValue;
    const newPPC = newAI / newTotalQty;

    const intendedCost = parseFloat(currentLData.lastOrder?.usdt_cost_real || 0);
    const refund = intendedCost > baseExecutedValue ? (intendedCost - baseExecutedValue) : 0;
    const finalLBalance = parseFloat(botState.lbalance || 0) + refund;

    const { price_var, size_var, profit_percent } = botState.config.long;
    
    const newSTPrice = newPPC * (1 + (parseNumber(profit_percent) / 100));
    const newNextPrice = executedPrice * (1 - (parseNumber(price_var) / 100));
    
    const { coveragePrice, numberOfOrders } = calculateLongCoverage(
        finalLBalance, 
        executedPrice, 
        executedQty * executedPrice, 
        parseNumber(price_var)/100, 
        parseNumber(size_var)/100
    );

    const SYMBOL = botState.config.symbol || 'BTC_USDT';
    await saveExecutedOrder({ ...orderDetails, symbol: SYMBOL, side: 'buy' }, LSTATE);

    await updateGeneralBotState({
        lbalance: finalLBalance,
        ltprice: newSTPrice,
        lcoverage: coveragePrice,
        lnorder: numberOfOrders,
        lStateData: {
            ...currentLData,
            ac: newTotalQty,
            ai: newAI,
            ppc: newPPC,
            lastOrder: null,
            nextCoveragePrice: newNextPrice,
            orderCountInCycle: (currentLData.orderCountInCycle || 0) + 1,
            cycleStartTime: isFirstOrder ? new Date() : currentLData.cycleStartTime
        }
    });
    
    log(`✅ [L-DATA] PPC: ${newPPC.toFixed(2)} | Sig. Compra: ${newNextPrice.toFixed(2)}`, 'success');
}

/**
 * Maneja una VENTA exitosa (Cierre de Long con Profit).
 */
async function handleSuccessfulSell(botStateObj, orderDetails, dependencies) {
    const { config, log, updateBotState, updateLStateData, updateGeneralBotState } = dependencies;
    
    try {
        const totalBtcToSell = botStateObj.lStateData.ac;
        const sellPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
        
        const totalUsdtReceived = (totalBtcToSell * sellPrice) * (1 - SELL_FEE_PERCENT);
        const profitNeto = totalUsdtReceived - botStateObj.lStateData.ai;

        await saveExecutedOrder({ ...orderDetails, side: 'sell' }, LSTATE);

        if (botStateObj.lStateData.cycleStartTime) {
            await logSuccessfulCycle({
                strategy: 'Long',
                cycleIndex: (botStateObj.lcycle || 0) + 1,
                netProfit: profitNeto,
                initialInvestment: botStateObj.lStateData.ai,
                finalRecovery: totalUsdtReceived
            });
        }

        const newLBalance = botStateObj.lbalance + totalUsdtReceived;
        
        // 🟢 Lógica Stop at Cycle:
        const shouldStopLong = config.long.stopAtCycle === true;

        await updateGeneralBotState({
            ...CLEAN_LONG_ROOT,
            lbalance: newLBalance,
            total_profit: (botStateObj.total_profit || 0) + profitNeto,
            lcycle: (Number(botStateObj.lcycle || 0) + 1),
            'config.long.enabled': !shouldStopLong // Sincroniza con la UI
        });

        await updateLStateData(CLEAN_STRATEGY_DATA);

        log(`💰 [L-DATA] Ciclo Long cerrado. Profit: +${profitNeto.toFixed(2)} USDT.`, 'success');
        
        // Transición de estado: STOPPED si debe parar, BUYING si continúa
        await updateBotState(shouldStopLong ? 'STOPPED' : 'BUYING', LSTATE);

    } catch (error) {
        log(`❌ [L-DATA] Error crítico: ${error.message}`, 'error');
        if (updateLStateData) await updateLStateData({ 'lastOrder': null });
        throw error;
    }
}

module.exports = { handleSuccessfulBuy, handleSuccessfulSell };