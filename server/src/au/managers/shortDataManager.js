// BSB/server/src/au/managers/shortDataManager.js

const { saveExecutedOrder } = require('../../../services/orderPersistenceService');
const { logSuccessfulCycle } = require('../../../services/cycleLogService');
const { calculateShortCoverage, parseNumber } = require('../../../autobotCalculations'); 
const { CLEAN_STRATEGY_DATA, CLEAN_SHORT_ROOT } = require('../utils/cleanState');

const SSTATE = 'short';
const BUY_FEE_PERCENT = 0.001; 

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

    const currentSData = botState.sStateData;
    const isFirstOrder = (currentSData.orderCountInCycle || 0) === 0;
    const currentTotalQty = isFirstOrder ? 0 : parseFloat(currentSData.ac || 0);
    const currentAI = isFirstOrder ? 0 : parseFloat(currentSData.ai || 0);
    
    const newTotalQty = currentTotalQty + executedQty;
    const newAI = currentAI + baseExecutedValue;
    const newPPC = newAI / newTotalQty;

    const { price_var, size_var } = botState.config.short;
    const newNextPrice = executedPrice * (1 + (parseNumber(price_var) / 100));
    
    const { coveragePrice, numberOfOrders } = calculateShortCoverage(
        botState.sbalance, executedPrice, botState.config.short.purchaseUsdt, 
        parseNumber(price_var)/100, parseNumber(size_var)/100
    );

    await saveExecutedOrder({ ...orderDetails, side: 'sell' }, SSTATE);

    await updateGeneralBotState({
        scoverage: coveragePrice,
        snorder: numberOfOrders,
        sStateData: {
            ...currentSData,
            ac: newTotalQty,
            ai: newAI,
            ppc: newPPC,
            lastOrder: null,
            nextCoveragePrice: newNextPrice,
            orderCountInCycle: (currentSData.orderCountInCycle || 0) + 1,
            cycleStartTime: isFirstOrder ? new Date() : currentSData.cycleStartTime
        }
    });
    log(`✅ [S-DATA] PPC Short: ${newPPC.toFixed(2)}`, 'success');
}

async function handleSuccessfulShortBuy(botStateObj, orderDetails, dependencies) {
    const { config, log, updateBotState, updateSStateData, updateGeneralBotState } = dependencies;
    
    try {
        const totalUsdtReceivedFromSales = botStateObj.sStateData.ai; 
        const buyPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
        const filledSize = parseFloat(orderDetails.filledSize || 0); 
        
        const totalSpentToCover = (filledSize * buyPrice) * (1 + BUY_FEE_PERCENT);
        const profitNeto = totalUsdtReceivedFromSales - totalSpentToCover;

        await saveExecutedOrder({ ...orderDetails, side: 'buy' }, SSTATE);

        // Registro de Ciclo
        if (botStateObj.sStateData.cycleStartTime) {
            await logSuccessfulCycle({
                strategy: 'Short',
                cycleIndex: (botStateObj.scycle || 0) + 1,
                netProfit: profitNeto,
                initialInvestment: totalUsdtReceivedFromSales,
                finalRecovery: totalSpentToCover
            });
        }

        const newSBalance = botStateObj.sbalance + totalSpentToCover + profitNeto;
        const shouldStopShort = config.short.stopAtCycle === true;

        // Limpieza y persistencia de configuración
        await updateGeneralBotState({
            ...CLEAN_SHORT_ROOT,
            sbalance: newSBalance,
            total_profit: (botStateObj.total_profit || 0) + profitNeto,
            scycle: (Number(botStateObj.scycle || 0) + 1),
            'config.short.enabled': !shouldStopShort 
        });

        await updateSStateData(CLEAN_STRATEGY_DATA);

        log(`💰 [S-DATA] Ciclo Short Cerrado. Profit: +${profitNeto.toFixed(2)} USDT.`, 'success');
        
        // REINICIO EXPONENCIAL: Si no para, vuelve a SELLING inmediatamente
        await updateBotState(shouldStopShort ? 'STOPPED' : 'SELLING', SSTATE);

    } catch (error) {
        log(`❌ [S-DATA] Error crítico: ${error.message}`, 'error');
        if (updateSStateData) await updateSStateData({ 'lastOrder': null });
        throw error;
    }
}

module.exports = { handleSuccessfulShortSell, handleSuccessfulShortBuy };