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
    
    // 1. Extraer datos reales de la ejecución en BitMart
    const executedQty = parseFloat(orderDetails.filledSize || 0);
    const executedPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
    const baseExecutedValue = executedQty * executedPrice;

    if (executedQty <= 0 || executedPrice <= 0) {
        log('[L-DATA] ⚠️ Ejecución inválida.', 'error');
        if (updateLStateData) await updateLStateData({ 'lastOrder': null });
        return;
    }

    const currentLData = botState.lStateData;
    const isFirstOrder = (currentLData.orderCountInCycle || 0) === 0;
    
    // 2. Cálculos de Acumulación con Saneamiento de Precisión
    const currentTotalQty = isFirstOrder ? 0 : parseFloat(currentLData.ac || 0);
    const currentAI = isFirstOrder ? 0 : parseFloat(currentLData.ai || 0);
    
    // CORRECCIÓN: Fix de precisión (8 decimales) para evitar el 0.00018999...
    const newTotalQty = parseFloat((currentTotalQty + executedQty).toFixed(8)); 
    const newAI = currentAI + baseExecutedValue;
    const newPPC = newAI / newTotalQty;
    const newOrderCount = (currentLData.orderCountInCycle || 0) + 1;

    // 3. Recálculo del LTPrice (Take Profit)
    // CORRECCIÓN: El target debe bajar junto con el PPC promediado
    const profitPercent = parseNumber(botState.config.long.profit_percent) / 100;
    const newLTPrice = newPPC * (1 + profitPercent);

    // 4. Proyección de la Siguiente Cobertura (Lógica Exponencial)
    const { price_var, size_var, purchaseUsdt } = botState.config.long;
    const newNextPrice = executedPrice * (1 - (parseNumber(price_var) / 100));
    
    // CORRECCIÓN: Salta al siguiente requerimiento (ej: de 12 a 24 USDT)
    const nextRequiredAmount = getExponentialAmount(purchaseUsdt, newOrderCount);
    
    // Recalcular cuántas órdenes más soporta el balance real restante
    const { coveragePrice, numberOfOrders } = calculateLongCoverage(
        botState.lbalance - baseExecutedValue, 
        executedPrice, 
        purchaseUsdt, 
        parseNumber(price_var)/100, 
        parseNumber(size_var)/100
    );

    // 5. Persistencia y Sincronización Atómica
    await saveExecutedOrder({ ...orderDetails, side: 'buy' }, LSTATE);

    await updateGeneralBotState({
        lcoverage: coveragePrice,
        lnorder: numberOfOrders,
        lbalance: botState.lbalance - baseExecutedValue, // Sincroniza el gasto real
        ltprice: newLTPrice,                            // CORRECCIÓN: Actualiza el precio de salida
        lStateData: {
            ...currentLData,
            ac: newTotalQty,
            ai: newAI,
            ppc: newPPC,
            lastOrder: null,
            lastExecutionPrice: executedPrice,      // Registro del precio de esta orden
            requiredCoverageAmount: nextRequiredAmount, // Salto exponencial 2^n
            nextCoveragePrice: newNextPrice,
            orderCountInCycle: newOrderCount,
            cycleStartTime: isFirstOrder ? new Date() : currentLData.cycleStartTime
        }
    });

    log(`✅ [L-DATA] Orden #${newOrderCount} procesada. PPC: ${newPPC.toFixed(2)}. Target Sale: ${newLTPrice.toFixed(2)}. Próx: ${nextRequiredAmount} USDT`, 'success');
}

async function handleSuccessfulSell(botStateObj, orderDetails, dependencies) {
    const { 
        config, log, updateBotState, updateLStateData, 
        updateGeneralBotState, logSuccessfulCycle // <--- Recibida de deps
    } = dependencies;
    
    try {
        const currentLData = botStateObj.lStateData;
        
        // 1. Cálculos de precisión (8 decimales para BTC)
        const totalBtcToSell = parseFloat(currentLData.ac || 0);
        const sellPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
        
        // Retorno neto tras la comisión de BitMart
        const totalUsdtReceived = (totalBtcToSell * sellPrice) * (1 - SELL_FEE_PERCENT);
        const totalInvestment = parseFloat(currentLData.ai || 0);
        const profitNeto = totalUsdtReceived - totalInvestment;

        // 2. Registro obligatorio en historial
        if (logSuccessfulCycle && currentLData.cycleStartTime) {
            try {
                await logSuccessfulCycle({
                    strategy: 'Long',
                    cycleIndex: (botStateObj.lcycle || 0) + 1,
                    netProfit: profitNeto,
                    initialInvestment: totalInvestment,
                    finalRecovery: totalUsdtReceived
                });
                log(`✅ Ciclo #${(botStateObj.lcycle || 0) + 1} guardado en base de datos.`, 'success');
            } catch (dbError) {
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