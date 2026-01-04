// BSB/server/src/au/managers/longDataManager.js

const { saveExecutedOrder } = require('../../../services/orderPersistenceService');
const { logSuccessfulCycle } = require('../../../services/cycleLogService');
const { calculateLongCoverage, parseNumber } = require('../../../autobotCalculations'); 
// Importamos la limpieza específica para Long
const { CLEAN_STRATEGY_DATA, CLEAN_LONG_ROOT } = require('../utils/cleanState');

const LSTATE = 'long';
const SELL_FEE_PERCENT = 0.001; // 0.1%

/**
 * Maneja una COMPRA exitosa: Recalcula la posición basándose en la última ejecución.
 */
async function handleSuccessfulBuy(botState, orderDetails, log, dependencies = {}) {
    const { updateGeneralBotState, updateLStateData } = dependencies;
    
    const executedQty = parseFloat(orderDetails.filledSize || 0);
    const executedPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
    const baseExecutedCost = executedQty * executedPrice;

    if (executedQty <= 0 || executedPrice <= 0) {
        log('⚠️ [L-DATA] Compra con volumen/precio cero. Abortando consolidación.', 'error');
        if (updateLStateData) await updateLStateData({ 'lastOrder': null });
        return;
    }

    const currentLData = botState.lStateData;
    const isFirstOrder = (currentLData.orderCountInCycle || 0) === 0;
    
    const currentTotalQty = isFirstOrder ? 0 : parseFloat(currentLData.ac || 0);
    const currentAI = isFirstOrder ? 0 : parseFloat(currentLData.ai || 0);
    
    const newTotalQty = currentTotalQty + executedQty;
    const newAI = currentAI + baseExecutedCost;
    const newPPC = newAI / newTotalQty;

    const intendedCost = parseFloat(currentLData.lastOrder?.usdt_cost_real || 0);
    const refund = intendedCost > baseExecutedCost ? (intendedCost - baseExecutedCost) : 0;
    const finalLBalance = parseFloat(botState.lbalance || 0) + refund;

    const { price_var, size_var, profit_percent } = botState.config.long;
    
    const newLTPrice = newPPC * (1 + (parseNumber(profit_percent) / 100));
    const newNextPrice = executedPrice * (1 - (parseNumber(price_var) / 100));
    
    const { coveragePrice, numberOfOrders } = calculateLongCoverage(
        finalLBalance, 
        executedPrice, 
        executedQty * executedPrice, 
        parseNumber(price_var)/100, 
        parseNumber(size_var)/100
    );

    const SYMBOL = botState.config.symbol || 'BTC_USDT';
    await saveExecutedOrder({ ...orderDetails, symbol: SYMBOL }, LSTATE);

    await updateGeneralBotState({
        lbalance: finalLBalance,
        ltprice: newLTPrice,
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
 * Maneja una VENTA exitosa: Cierre total y reseteo de la cadena exponencial.
 */
async function handleSuccessfulSell(botStateObj, orderDetails, dependencies) {
    const { config, log, updateBotState, updateLStateData, updateGeneralBotState } = dependencies;
    
    try {
        const totalUsdtSpent = botStateObj.lStateData.ai;
        const sellPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
        const filledSize = parseFloat(orderDetails.filledSize || 0); 
        
        const totalRecoveredNeto = (filledSize * sellPrice) * (1 - SELL_FEE_PERCENT);
        const profitNeto = totalRecoveredNeto - totalUsdtSpent;
        
        const isFullSell = filledSize >= (botStateObj.lStateData.ac * 0.99);

        await saveExecutedOrder({ ...orderDetails, side: 'sell' }, LSTATE);

        if (botStateObj.lStateData.cycleStartTime) {
            await logSuccessfulCycle({
                strategy: 'Long', 
                cycleIndex: (botStateObj.lcycle || 0) + 1,
                netProfit: profitNeto,
                initialInvestment: totalUsdtSpent,
                finalRecovery: totalRecoveredNeto
            });
        }

        const newLBalance = botStateObj.lbalance + totalRecoveredNeto;
        
        if (isFullSell) {
            // 🟢 USAMOS CLEAN_LONG_ROOT para no afectar los campos del Short (stprice, etc)
            await updateGeneralBotState({
                ...CLEAN_LONG_ROOT,
                lbalance: newLBalance,
                total_profit: (botStateObj.total_profit || 0) + profitNeto,
                lcycle: (Number(botStateObj.lcycle || 0) + 1)
            });

            // 🟢 Reseteamos lStateData con la constante genérica
            await updateLStateData(CLEAN_STRATEGY_DATA);

            log(`💰 [L-DATA] Ciclo cerrado. Profit: +${profitNeto.toFixed(2)} USDT.`, 'success');
            
            // 🟢 VERIFICACIÓN INDEPENDIENTE: Usamos config.long.stopAtCycle
            const shouldStop = config.long.stopAtCycle === true;
            await updateBotState(shouldStop ? 'STOPPED' : 'BUYING', LSTATE);
            
        } else {
            const remainingAc = Math.max(0, botStateObj.lStateData.ac - filledSize);
            await updateLStateData({ 
                ac: remainingAc, 
                ai: (botStateObj.lStateData.ppc * remainingAc), 
                lastOrder: null 
            });
            await updateBotState('SELLING', LSTATE);
        }

    } catch (error) {
        log(`❌ [L-DATA] Error en cierre: ${error.message}`, 'error');
        throw error;
    }
}

module.exports = { handleSuccessfulBuy, handleSuccessfulSell };