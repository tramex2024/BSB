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
    
    // 1. Datos reales de BitMart
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
    
    // 2. Acumulados con Saneamiento de Precisión
    const currentTotalQty = isFirstOrder ? 0 : parseFloat(currentSData.ac || 0);
    const currentAI = isFirstOrder ? 0 : parseFloat(currentSData.ai || 0);
    
    // CORRECCIÓN: Fix precisión decimal (8 para BTC)
    const newTotalQty = parseFloat((currentTotalQty + executedQty).toFixed(8)); 
    const newAI = currentAI + baseExecutedValue;
    const newPPC = newAI / newTotalQty;
    const newOrderCount = (currentSData.orderCountInCycle || 0) + 1;

    // 3. Recálculo del STPrice (Take Profit Short)
    // CORRECCIÓN: El target debe SUBIR junto con el PPC promediado (vender caro, comprar barato)
    const profitPercent = parseNumber(botState.config.short.profit_percent) / 100;
    const newSTPrice = newPPC * (1 - profitPercent); // Target es un precio MENOR al PPC

    // 4. Lógica Exponencial Pura
    const { price_var, size_var, purchaseUsdt } = botState.config.short;
    const newNextPrice = executedPrice * (1 + (parseNumber(price_var) / 100)); // Hacia arriba
    
    // CORRECCIÓN: Uso de función exponencial centralizada 2^n
    const nextRequiredAmount = getExponentialAmount(purchaseUsdt, newOrderCount);
    
    // 5. Actualización de Resistencia
    const { coveragePrice, numberOfOrders } = calculateShortCoverage(
        botState.sbalance - baseExecutedValue, // CORRECCIÓN: Usar balance real restante
        newPPC, 
        purchaseUsdt, 
        parseNumber(price_var)/100, 
        parseNumber(size_var)/100
    );

    await saveExecutedOrder({ ...orderDetails, side: 'sell' }, SSTATE);

    await updateGeneralBotState({
        scoverage: coveragePrice,
        snorder: numberOfOrders,
        sbalance: botState.sbalance - baseExecutedValue, // Sincronización de saldo
        stprice: newSTPrice,                             // CORRECCIÓN: Nuevo Target Price
        sStateData: {
            ...currentSData,
            ac: newTotalQty,
            ai: newAI,
            ppc: newPPC,
            lastOrder: null,
            lastExecutionPrice: executedPrice,           // CORRECCIÓN: Memoria de precio real
            nextCoveragePrice: newNextPrice,
            requiredCoverageAmount: nextRequiredAmount,  // Salto 2^n
            orderCountInCycle: newOrderCount,
            cycleStartTime: isFirstOrder ? new Date() : currentSData.cycleStartTime
        }
    });
    
    log(`✅ [S-DATA] Orden Short #${newOrderCount}. PPC: ${newPPC.toFixed(2)}. Target Recompra: ${newSTPrice.toFixed(2)}`, 'success');
}

/**
 * Maneja el éxito de una COMPRA (Take Profit).
 * Cierra el ciclo, liquida profit y reinicia o detiene el bot.
 */
async function handleSuccessfulShortBuy(botStateObj, orderDetails, dependencies) {
    const { config, log, updateBotState, updateSStateData, updateGeneralBotState } = dependencies;
    
    try {
        const currentSData = botStateObj.sStateData;
        
        // 1. Datos de la Recompra Final (Cierre)
        const buyPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
        const filledSize = parseFloat(orderDetails.filledSize || 0); 
        
        // AI (Acumulado de Inversión) es TODO el efectivo que entró por las ventas
        const totalUsdtReceivedFromSales = parseFloat(currentSData.ai || 0); 

        // 2. CÁLCULO DE PROFIT REAL (Saneado)
        // Lo que nos costó recomprar en BitMart (incluyendo el fee de la compra final)
        const totalSpentToCover = (filledSize * buyPrice) * (1 + BUY_FEE_PERCENT);
        
        // Profit Neto = (Efectivo total de ventas) - (Efectivo total gastado en recompra)
        const profitNeto = totalUsdtReceivedFromSales - totalSpentToCover;

        // 3. ACTUALIZACIÓN DE BALANCE INTERNO (El punto crítico)
        // El sbalance actual ya fue restado durante las ventas (en handleSuccessfulShortSell).
        // Por lo tanto, al cerrar, debemos devolver al balance:
        // A. El capital original que se usó (totalSpentToCover - profit) -> No, más simple:
        // Simplemente sumamos el AI (que es el capital + profit bruto) y ajustamos por el gasto real.
        
        // Nueva fórmula simplificada y exacta:
        // El sbalance recupera el valor de las ventas y le sumamos/restamos el resultado final.
        const newSBalance = (parseFloat(botStateObj.sbalance) || 0) + totalUsdtReceivedFromSales - (totalSpentToCover - profitNeto);
        // Nota: En realidad, el profitNeto ya está implícito en la diferencia.
        // La forma más segura: Balance Anterior + Lo que sobró de la operación.
        const finalizedSBalance = (parseFloat(botStateObj.sbalance) || 0) + totalUsdtReceivedFromSales - (filledSize * buyPrice);

        // 4. PERSISTENCIA
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

        // 5. COMMIT FINAL A BASE DE DATOS
        await updateGeneralBotState({
            ...CLEAN_SHORT_ROOT,
            sbalance: parseFloat(finalizedSBalance.toFixed(8)), // Limpieza de decimales
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