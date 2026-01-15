// BSB/server/src/au/managers/shortDataManager.js

const { saveExecutedOrder } = require('../../../services/orderPersistenceService');
const { logSuccessfulCycle } = require('../../../services/cycleLogService');
const { calculateShortCoverage, parseNumber, getExponentialAmount } = require('../../../autobotCalculations'); 
const { CLEAN_STRATEGY_DATA, CLEAN_SHORT_ROOT } = require('../utils/cleanState');

const SSTATE = 'short';
const BUY_FEE_PERCENT = 0.001; 

/**
 * Maneja el éxito de una VENTA (Apertura o DCA).
 * Actualizada con lógica exponencial dinámica (size_var).
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

    // --- 1. SANEAMIENTO DE BALANCE ---
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

    // --- 2. CÁLCULO DE TARGETS (TP y Siguiente Cobertura) ---
    const profitPercent = parseNumber(botState.config.short.profit_percent) / 100;
    const newSTPrice = newPPC * (1 - profitPercent);

    const { price_var, size_var, purchaseUsdt } = botState.config.short;
    
    // El precio de la próxima cobertura se basa en el último precio ejecutado
    const newNextPrice = executedPrice * (1 + (parseNumber(price_var) / 100));

    // CORRECCIÓN CRÍTICA: Ahora enviamos size_var como 3er parámetro para la lógica 2^n
    const nextRequiredAmount = getExponentialAmount(purchaseUsdt, newOrderCount, size_var);
    
    // --- 3. CÁLCULO DE COBERTURA RESTANTE (Resistencia) ---
    const { coveragePrice, numberOfOrders } = calculateShortCoverage(
        finalizedSBalance, 
        newPPC, 
        purchaseUsdt, 
        parseNumber(price_var) / 100, 
        parseNumber(size_var) // Enviamos el valor entero (ej: 100) para que la calculadora procese el multiplicador (1 + 100/100)
    );

    // --- 4. PERSISTENCIA Y ACTUALIZACIÓN ---
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
    const { 
        config, log, updateBotState, updateSStateData, 
        updateGeneralBotState, logSuccessfulCycle // Asegúrate que logSuccessfulCycle venga en deps
    } = dependencies;
    
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
        const finalizedSBalance = parseFloat(((parseFloat(botStateObj.sbalance) || 0) + totalUsdtReceivedFromSales + profitNeto).toFixed(8));

        await saveExecutedOrder({ ...orderDetails, side: 'buy' }, SSTATE);

        // --- REGISTRO CORREGIDO PARA SHORT ---
        if (logSuccessfulCycle && currentSData.cycleStartTime) {
            try {
                await logSuccessfulCycle({
                    autobotId: botStateObj._id,
                    symbol: botStateObj.config.symbol || 'BTC_USDT',
                    strategy: 'Short',
                    cycleIndex: (botStateObj.scycle || 0) + 1,
                    startTime: currentSData.cycleStartTime,
                    endTime: new Date(),
                    averagePPC: parseFloat(currentSData.ppc || 0),
                    finalSellPrice: buyPrice, // En Short, el precio final es el de compra
                    orderCount: parseInt(currentSData.orderCountInCycle || 0),
                    initialInvestment: totalUsdtReceivedFromSales,
                    finalRecovery: totalSpentToCover,
                    netProfit: profitNeto,
                    profitPercentage: (profitNeto / totalUsdtReceivedFromSales) * 100
                });
                log(`✅ Ciclo Short #${(botStateObj.scycle || 0) + 1} guardado.`, 'success');
            } catch (dbError) {
                log(`⚠️ Error al guardar ciclo Short: ${dbError.message}`, 'error');
            }
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

        log(`💰 [S-DATA] Ciclo Short Cerrado. Profit: +${profitNeto.toFixed(2)} USDT.`, 'success');
        await updateBotState(shouldStopShort ? 'STOPPED' : 'RUNNING', SSTATE);

    } catch (error) {
        log(`❌ [S-DATA] Error crítico en cierre Short: ${error.message}`, 'error');
        if (updateSStateData) await updateSStateData({ 'lastOrder': null });
        throw error;
    }
}
module.exports = { handleSuccessfulShortSell, handleSuccessfulShortBuy };