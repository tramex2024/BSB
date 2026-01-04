// BSB/server/src/au/managers/shortDataManager.js

const { saveExecutedOrder } = require('../../../services/orderPersistenceService');
const { logSuccessfulCycle } = require('../../../services/cycleLogService');
const { calculateShortCoverage, parseNumber } = require('../../../autobotCalculations'); 

const SSTATE = 'short';
const BUY_FEE_PERCENT = 0.001; // 0.1% comisión de recompra

/**
 * Maneja una VENTA exitosa (Apertura o DCA de Short).
 * En Short, AI representa el capital cobrado por vender BTC.
 */
async function handleSuccessfulShortSell(botState, orderDetails, log, dependencies = {}) {
    const { updateGeneralBotState, updateSStateData } = dependencies;

    // 1. Datos de ejecución
    const executedQty = parseFloat(orderDetails.filledSize || 0);
    const executedPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
    const baseExecutedValue = executedQty * executedPrice;

    if (executedQty <= 0 || executedPrice <= 0) {
        log('[S] ⚠️ Error: Ejecución con valores cero. Limpiando orden.', 'error');
        if (updateSStateData) await updateSStateData({ 'lastOrder': null });
        return;
    }

    // 2. Matemáticas de Short (PPC y AC)
    const isFirstOrder = (botState.sStateData.orderCountInCycle || 0) === 0;
    const currentTotalQty = isFirstOrder ? 0 : parseFloat(botState.sStateData.ac || 0);
    const currentAI = isFirstOrder ? 0 : parseFloat(botState.sStateData.ai || 0);
    
    const newTotalQty = currentTotalQty + executedQty;
    const newAI = currentAI + baseExecutedValue;
    const newPPC = newAI / newTotalQty; // Precio promedio de venta

    // 3. Gestión de Capital (Reembolso de USDT no utilizado)
    const intendedCost = parseFloat(botState.sStateData.lastOrder?.usdt_cost_real || 0);
    const refund = intendedCost > baseExecutedValue ? (intendedCost - baseExecutedValue) : 0;
    const finalSBalance = (parseFloat(botState.sbalance || 0)) + refund;

    // 4. Recálculo de Targets (TP Abajo, DCA Arriba)
    const { price_var, size_var, purchaseUsdt, profit_percent } = botState.config.short;
    const newSTPrice = newPPC * (1 - (parseNumber(profit_percent) / 100));
    const newNextPrice = executedPrice * (1 + (parseNumber(price_var) / 100));
    
    // Cobertura dinámica Short
    const { coveragePrice, numberOfOrders } = calculateShortCoverage(
        finalSBalance, newPPC, purchaseUsdt, 
        parseNumber(price_var)/100, parseNumber(size_var)/100
    );

    // 5. PERSISTENCIA ATÓMICA
    const SYMBOL = botState.config.symbol || 'BTC_USDT';
    await saveExecutedOrder({ ...orderDetails, symbol: SYMBOL, side: 'sell' }, SSTATE);

    const updatePayload = {
        sbalance: finalSBalance,
        stprice: newSTPrice,
        scoverage: coveragePrice,
        snorder: numberOfOrders,
        sStateData: {
            ...botState.sStateData,
            ac: newTotalQty,
            ai: newAI,
            ppc: newPPC,
            lastOrder: null,
            nextCoveragePrice: newNextPrice,
            orderCountInCycle: (botState.sStateData.orderCountInCycle || 0) + 1,
            cycleStartTime: isFirstOrder ? new Date() : botState.sStateData.cycleStartTime
        }
    };

    if (updateGeneralBotState) {
        await updateGeneralBotState(updatePayload);
    }
    
    log(`✅ [SHORT] Venta Consolidada. PPC (Venta): ${newPPC.toFixed(2)} | Deuda AC: ${newTotalQty.toFixed(8)}`, 'success');
}

/**
 * Maneja una COMPRA exitosa (Cierre de Short con Profit).
 */
async function handleSuccessfulShortBuy(botStateObj, orderDetails, dependencies) {
    const { config, log, updateBotState, updateSStateData, updateGeneralBotState } = dependencies;
    
    try {
        const totalUsdtReceivedFromSales = botStateObj.sStateData.ai; 
        const buyPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
        const filledSize = parseFloat(orderDetails.filledSize || 0); 
        
        // Costo de recomprar para devolver
        const totalSpentToCover = (filledSize * buyPrice) * (1 + BUY_FEE_PERCENT);
        const profitNeto = totalUsdtReceivedFromSales - totalSpentToCover;

        // Registro Histórico
        await saveExecutedOrder({ ...orderDetails, side: 'buy' }, SSTATE);

        if (botStateObj.sStateData.cycleStartTime) {
            await logSuccessfulCycle({
                strategy: 'Short',
                cycleIndex: (botStateObj.scycle || 0) + 1,
                netProfit: profitNeto,
                initialInvestment: totalUsdtReceivedFromSales,
                finalRecovery: totalSpentToCover
            });
        }

        // Recuperación: Balance actual + Capital usado + Ganancia
        const newSBalance = botStateObj.sbalance + totalSpentToCover + profitNeto;
        
        await updateGeneralBotState({
            sbalance: newSBalance,
            total_profit: (botStateObj.total_profit || 0) + profitNeto,
            stprice: 0,
            scycle: (botStateObj.scycle || 0) + 1
        });

        // Reset total del ciclo Short
        await updateSStateData({
            ac: 0, ppc: 0, ai: 0, orderCountInCycle: 0, lastOrder: null,
            lastExecutionPrice: 0, nextCoveragePrice: 0, requiredCoverageAmount: 0,
            cycleStartTime: null
        });

        log(`💰 [S-CIERRE] Short cerrado. Profit: +${profitNeto.toFixed(2)} USDT.`, 'success');
        await updateBotState(config.short.stopAtCycle ? 'STOPPED' : 'RUNNING', SSTATE);

    } catch (error) {
        log(`❌ [S] Error crítico en cierre: ${error.message}`, 'error');
        if (updateSStateData) await updateSStateData({ 'lastOrder': null });
        throw error;
    }
}

module.exports = { handleSuccessfulShortSell, handleSuccessfulShortBuy };