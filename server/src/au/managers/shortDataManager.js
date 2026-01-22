// BSB/server/src/au/managers/shortDataManager.js

const { saveExecutedOrder } = require('../../../services/orderPersistenceService');
const { logSuccessfulCycle } = require('../../../services/cycleLogService');
const { calculateShortCoverage, parseNumber, getExponentialAmount } = require('../../../autobotCalculations'); 
const { CLEAN_STRATEGY_DATA, CLEAN_SHORT_ROOT } = require('../utils/cleanState');

const SSTATE = 'short';
const BUY_FEE_PERCENT = 0.001; 

/**
 * Maneja el éxito de una VENTA (Apertura o DCA).
 */
async function handleSuccessfulShortSell(botState, orderDetails, log, dependencies = {}) {
    const { updateGeneralBotState, updateSStateData } = dependencies;
    
    const executedQty = parseFloat(orderDetails.filledSize || 0);
    const executedPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
    const baseExecutedValue = executedQty * executedPrice;

    if (executedQty <= 0 || executedPrice <= 0) {
        log('[S-DATA] ⚠️ Ejecución inválida.', 'error');
        if (updateSStateData) await updateSStateData({ 'lastOrder': null });
        return;
    }

    // --- SANEAMIENTO DE BALANCE ---
    const currentSBalance = parseFloat(botState.sbalance || 0);
    const finalizedSBalance = parseFloat((currentSBalance - baseExecutedValue).toFixed(8));

    const currentSData = botState.sStateData;
    const isFirstOrder = (currentSData.orderCountInCycle || 0) === 0;
    
    const currentTotalQty = isFirstOrder ? 0 : parseFloat(currentSData.ac || 0);
    const currentAI = isFirstOrder ? 0 : parseFloat(currentSData.ai || 0);
    
    const newTotalQty = parseFloat((currentTotalQty + executedQty).toFixed(8)); 
    const newAI = currentAI + baseExecutedValue;
    const newPPC = newAI / newTotalQty;
    const newOrderCount = (currentSData.orderCountInCycle || 0) + 1;

    // Target de recompra (precio menor al promedio de venta)
    const profitPercent = parseNumber(botState.config.short.profit_percent) / 100;
    const newSTPrice = newPPC * (1 - profitPercent);

    const { price_var, size_var, purchaseUsdt } = botState.config.short;
    const newNextPrice = executedPrice * (1 + (parseNumber(price_var) / 100));
    const nextRequiredAmount = getExponentialAmount(purchaseUsdt, newOrderCount);
    
    const { coveragePrice, numberOfOrders } = calculateShortCoverage(
        finalizedSBalance, 
        newPPC, 
        purchaseUsdt, 
        parseNumber(price_var)/100, 
        parseNumber(size_var)/100
    );

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
    
    log(`✅ [S-DATA] Orden #${newOrderCount} (Venta). Nuevo Bal: ${finalizedSBalance.toFixed(2)}. Target TP: ${newSTPrice.toFixed(2)}`, 'success');
}

/**
 * Maneja el éxito de una COMPRA (Take Profit).
 */
async function handleSuccessfulShortBuy(botStateObj, orderDetails, dependencies) {
    const { config, log, updateBotState, updateSStateData, updateGeneralBotState } = dependencies;
    
    try {
        const currentSData = botStateObj.sStateData;
        const buyPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
        const filledSize = parseFloat(orderDetails.filledSize || 0); 
        
        // AI es el capital que entró por las ventas previas
        const totalUsdtReceivedFromSales = parseFloat(currentSData.ai || 0); 

        // Costo real de cerrar la deuda en BitMart
        const totalSpentToCover = (filledSize * buyPrice) * (1 + BUY_FEE_PERCENT);
        const profitNeto = totalUsdtReceivedFromSales - totalSpentToCover;

        // RECUPERACIÓN DE BALANCE:
        // El sbalance ya fue restado en cada venta. Al cerrar, devolvemos el capital 
        // inicial más el profit generado.
        const finalizedSBalance = parseFloat(((parseFloat(botStateObj.sbalance) || 0) + totalUsdtReceivedFromSales + profitNeto).toFixed(8));

        await saveExecutedOrder({ ...orderDetails, side: 'buy' }, SSTATE);

        if (currentSData.cycleStartTime) {
            await logSuccessfulCycle({
                strategy: 'Short',
                cycleIndex: (botStateObj.scycle || 0) + 1,
                netProfit: profitNeto,
                initialInvestment: totalUsdtReceivedFromSales,
                finalRecovery: totalSpentToCover
            });
        }

        const shouldStopShort = config.short.stopAtCycle === true;

        await updateGeneralBotState({
            ...CLEAN_SHORT_ROOT,
            sbalance: finalizedSBalance,
            total_profit: (parseFloat(botStateObj.total_profit) || 0) + profitNeto,
            scycle: (Number(botStateObj.scycle || 0) + 1),
            'config.short.enabled': !shouldStopShort 
        });

        await updateSStateData(CLEAN_STRATEGY_DATA);

        log(`💰 [S-DATA] Ciclo Short Cerrado. Profit: +${profitNeto.toFixed(2)} USDT. Nuevo Bal: ${finalizedSBalance.toFixed(2)}`, 'success');
        await updateBotState(shouldStopShort ? 'STOPPED' : 'RUNNING', SSTATE);

    } catch (error) {
        log(`❌ [S-DATA] Error crítico en cierre Short: ${error.message}`, 'error');
        if (updateSStateData) await updateSStateData({ 'lastOrder': null });
        throw error;
    }
}

module.exports = { handleSuccessfulShortSell, handleSuccessfulShortBuy };