// BSB/server/src/au/managers/shortDataManager.js

const { saveExecutedOrder } = require('../../../services/orderPersistenceService');
const { logSuccessfulCycle } = require('../../../services/cycleLogService');
const { calculateShortCoverage, parseNumber } = require('../../../autobotCalculations'); 
const { CLEAN_STRATEGY_DATA, CLEAN_SHORT_ROOT } = require('../utils/cleanState');

const SSTATE = 'short';
const BUY_FEE_PERCENT = 0.001; 

/**
 * Maneja el éxito de una VENTA (Apertura o DCA).
 * Aquí se aplica la LÓGICA EXPONENCIAL para la siguiente orden.
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

    const currentSData = botState.sStateData;
    const isFirstOrder = (currentSData.orderCountInCycle || 0) === 0;
    
    // 1. ACUMULADOS
    const currentTotalQty = isFirstOrder ? 0 : parseFloat(currentSData.ac || 0);
    const currentAI = isFirstOrder ? 0 : parseFloat(currentSData.ai || 0);
    
    const newTotalQty = currentTotalQty + executedQty;
    const newAI = currentAI + baseExecutedValue;
    const newPPC = newAI / newTotalQty;

    // 2. LÓGICA EXPONENCIAL PARA LA SIGUIENTE COBERTURA
    const { price_var, size_var, purchaseUsdt } = botState.config.short;
    
    // Próximo precio basado en la variación porcentual (hacia ARRIBA en Short)
    const newNextPrice = executedPrice * (1 + (parseNumber(price_var) / 100));
    
    // Cálculo del SIGUIENTE MONTO EXPONENCIAL (USDT)
    // Si es la primera, la siguiente es purchaseUsdt * (1 + size_var). 
    // Si ya es un DCA, usamos el monto de la orden actual multiplicado por el factor.
    const lastOrderAmount = parseFloat(orderDetails.usdt_amount || purchaseUsdt);
    const nextRequiredAmount = lastOrderAmount * (1 + (parseNumber(size_var) / 100));
    
    // 3. ACTUALIZACIÓN DE INDICADORES DE COBERTURA
    const { coveragePrice, numberOfOrders } = calculateShortCoverage(
        botState.sbalance, 
        newPPC, 
        purchaseUsdt, 
        parseNumber(price_var)/100, 
        parseNumber(size_var)/100
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
            requiredCoverageAmount: nextRequiredAmount, // 🟢 Siguiente paso de la progresión
            orderCountInCycle: (currentSData.orderCountInCycle || 0) + 1,
            cycleStartTime: isFirstOrder ? new Date() : currentSData.cycleStartTime
        }
    });
    
    log(`✅ [S-DATA] PPC Short: ${newPPC.toFixed(2)} | Next DCA: $${nextRequiredAmount.toFixed(2)}`, 'success');
}

/**
 * Maneja el éxito de una COMPRA (Take Profit).
 * Cierra el ciclo, liquida profit y reinicia o detiene el bot.
 */
async function handleSuccessfulShortBuy(botStateObj, orderDetails, dependencies) {
    const { config, log, updateBotState, updateSStateData, updateGeneralBotState } = dependencies;
    
    try {
        const totalUsdtReceivedFromSales = botStateObj.sStateData.ai; 
        const buyPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
        const filledSize = parseFloat(orderDetails.filledSize || 0); 
        
        // El costo de cerrar la posición (Recomprar el BTC)
        const totalSpentToCover = (filledSize * buyPrice) * (1 + BUY_FEE_PERCENT);
        const profitNeto = totalUsdtReceivedFromSales - totalSpentToCover;

        await saveExecutedOrder({ ...orderDetails, side: 'buy' }, SSTATE);

        // Registro de Ciclo en historial
        if (botStateObj.sStateData.cycleStartTime) {
            await logSuccessfulCycle({
                strategy: 'Short',
                cycleIndex: (botStateObj.scycle || 0) + 1,
                netProfit: profitNeto,
                initialInvestment: totalUsdtReceivedFromSales,
                finalRecovery: totalSpentToCover
            });
        }

        // Recuperamos el balance asignado + el profit generado
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
        
        // Si stopAtCycle es false, volvemos a RUNNING para esperar nueva señal
        await updateBotState(shouldStopShort ? 'STOPPED' : 'RUNNING', SSTATE);

    } catch (error) {
        log(`❌ [S-DATA] Error crítico en cierre Short: ${error.message}`, 'error');
        if (updateSStateData) await updateSStateData({ 'lastOrder': null });
        throw error;
    }
}

module.exports = { handleSuccessfulShortSell, handleSuccessfulShortBuy };