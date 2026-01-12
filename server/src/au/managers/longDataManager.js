// BSB/server/src/au/managers/longDataManager.js

const { saveExecutedOrder } = require('../../../services/orderPersistenceService');
const { logSuccessfulCycle } = require('../../../services/cycleLogService');
const { calculateLongCoverage, parseNumber, getExponentialAmount } = require('../../../autobotCalculations'); // Añadido getExponentialAmount
const { CLEAN_STRATEGY_DATA, CLEAN_LONG_ROOT } = require('../utils/cleanState');

const LSTATE = 'long';
const SELL_FEE_PERCENT = 0.001; 

/**
 * Procesa el éxito de una compra Long, actualizando balances, 
 * acumulados y proyectando el siguiente nivel exponencial.
 */
async function handleSuccessfulBuy(botState, orderDetails, log, dependencies = {}) {
    const { updateGeneralBotState, updateLStateData } = dependencies;
    
    const executedQty = parseFloat(orderDetails.filledSize || 0);
    const executedPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
    const baseExecutedValue = executedQty * executedPrice;

    if (executedQty <= 0 || executedPrice <= 0) {
        log('[L-DATA] ⚠️ Ejecución inválida.', 'error');
        if (updateLStateData) await updateLStateData({ 'lastOrder': null });
        return;
    }

    // --- CORRECCIÓN DE BALANCE ---
    // Calculamos el nuevo balance una sola vez aquí
    const currentBalance = parseFloat(botState.lbalance || 0);
    const finalizedLBalance = parseFloat((currentBalance - baseExecutedValue).toFixed(8));
    // -----------------------------

    const currentLData = botState.lStateData;
    const isFirstOrder = (currentLData.orderCountInCycle || 0) === 0;
    
    const currentTotalQty = isFirstOrder ? 0 : parseFloat(currentLData.ac || 0);
    const currentAI = isFirstOrder ? 0 : parseFloat(currentLData.ai || 0);
    
    const newTotalQty = parseFloat((currentTotalQty + executedQty).toFixed(8)); 
    const newAI = currentAI + baseExecutedValue;
    const newPPC = newAI / newTotalQty;
    const newOrderCount = (currentLData.orderCountInCycle || 0) + 1;

    const profitPercent = parseNumber(botState.config.long.profit_percent) / 100;
    const newLTPrice = newPPC * (1 + profitPercent);

    const { price_var, size_var, purchaseUsdt } = botState.config.long;
    const newNextPrice = executedPrice * (1 - (parseNumber(price_var) / 100));
    const nextRequiredAmount = getExponentialAmount(purchaseUsdt, newOrderCount);
    
    // Usamos el balance ya finalizado para el cálculo de cobertura
    const { coveragePrice, numberOfOrders } = calculateLongCoverage(
        finalizedLBalance, 
        executedPrice, 
        purchaseUsdt, 
        parseNumber(price_var)/100, 
        parseNumber(size_var)/100
    );

    await saveExecutedOrder({ ...orderDetails, side: 'buy' }, LSTATE);

    await updateGeneralBotState({
        lcoverage: coveragePrice,
        lnorder: numberOfOrders,
        lbalance: finalizedLBalance, // <--- Usamos la variable saneada
        ltprice: newLTPrice,
        lStateData: {
            ...currentLData,
            ac: newTotalQty,
            ai: newAI,
            ppc: newPPC,
            lastOrder: null,
            lastExecutionPrice: executedPrice,
            requiredCoverageAmount: nextRequiredAmount,
            nextCoveragePrice: newNextPrice,
            orderCountInCycle: newOrderCount,
            cycleStartTime: isFirstOrder ? new Date() : currentLData.cycleStartTime
        }
    });

    log(`✅ [L-DATA] Balance actualizado: $${finalizedLBalance}. PPC: ${newPPC.toFixed(2)}`, 'success');
}

async function handleSuccessfulSell(botStateObj, orderDetails, dependencies) {
    const { 
        config, log, updateBotState, updateLStateData, 
        updateGeneralBotState, logSuccessfulCycle 
    } = dependencies;
    
    try {
        const currentLData = botStateObj.lStateData;
        
        // 1. Cálculos de precisión
        const totalBtcToSell = parseFloat(currentLData.ac || 0);
        const sellPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
        
        const totalUsdtReceived = (totalBtcToSell * sellPrice) * (1 - SELL_FEE_PERCENT);
        const totalInvestment = parseFloat(currentLData.ai || 0);
        const profitNeto = totalUsdtReceived - totalInvestment;

        // 2. Registro corregido (Ahora con todos los campos requeridos)
        if (logSuccessfulCycle && currentLData.cycleStartTime) {
            try {
                await logSuccessfulCycle({
                    autobotId: botStateObj._id, // REQUERIDO
                    symbol: botStateObj.config.symbol || 'BTC_USDT', // REQUERIDO
                    strategy: 'Long',
                    cycleIndex: (botStateObj.lcycle || 0) + 1,
                    startTime: currentLData.cycleStartTime, // REQUERIDO
                    endTime: new Date(), // REQUERIDO
                    averagePPC: parseFloat(currentLData.ppc || 0), // REQUERIDO
                    finalSellPrice: sellPrice, // REQUERIDO
                    orderCount: parseInt(currentLData.orderCountInCycle || 0), // REQUERIDO
                    initialInvestment: totalInvestment,
                    finalRecovery: totalUsdtReceived,
                    netProfit: profitNeto,
                    profitPercentage: (profitNeto / totalInvestment) * 100 // REQUERIDO
                });
                log(`✅ Ciclo #${(botStateObj.lcycle || 0) + 1} guardado en base de datos.`, 'success');
            } catch (dbError) {
                // Aquí es donde caía el ciclo 10 por falta de campos
                log(`⚠️ Error al escribir en tradecycles: ${dbError.message}`, 'error');
            }
        }

        // 3. Restauración de Balance (Saneado)
        const newLBalance = parseFloat((botStateObj.lbalance + totalUsdtReceived).toFixed(8));
        const shouldStopLong = config.long.stopAtCycle === true;

        // 4. Limpieza de "Root" y "StateData"
        await updateGeneralBotState({
            ...CLEAN_LONG_ROOT,
            lbalance: newLBalance,
            total_profit: (parseFloat(botStateObj.total_profit) || 0) + profitNeto,
            lcycle: (Number(botStateObj.lcycle || 0) + 1),
            'config.long.enabled': !shouldStopLong 
        });

        await updateLStateData(CLEAN_STRATEGY_DATA);
        
        // 5. Transición de Estado
        log(`💰 [L-DATA] Venta finalizada: +${profitNeto.toFixed(2)} USDT.`, 'success');
        await updateBotState(shouldStopLong ? 'STOPPED' : 'BUYING', LSTATE);

    } catch (error) {
        log(`🔥 [CRITICAL] Fallo en handleSuccessfulSell: ${error.message}`, 'error');
        throw error;
    }
}

module.exports = { handleSuccessfulBuy, handleSuccessfulSell };