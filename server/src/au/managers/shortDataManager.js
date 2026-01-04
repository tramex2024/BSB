// BSB/server/src/au/managers/shortDataManager.js

const { saveExecutedOrder } = require('../../../services/orderPersistenceService');
const { logSuccessfulCycle } = require('../../../services/cycleLogService');
const { calculateShortCoverage, parseNumber } = require('../../../autobotCalculations'); 

const SSTATE = 'short';
const BUY_FEE_PERCENT = 0.001; // 0.1% comisión de recompra

/**
 * Maneja una VENTA exitosa (Apertura o DCA de Short).
 */
async function handleSuccessfulShortSell(botState, orderDetails, log, dependencies = {}) {
    const { updateGeneralBotState, updateSStateData } = dependencies;

    // 1. Datos de ejecución real
    const executedQty = parseFloat(orderDetails.filledSize || 0);
    const executedPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
    const baseExecutedValue = executedQty * executedPrice;

    if (executedQty <= 0 || executedPrice <= 0) {
        log('[S-DATA] ⚠️ Ejecución inválida. Limpiando bloqueo.', 'error');
        if (updateSStateData) await updateSStateData({ 'lastOrder': null });
        return;
    }

    // 2. MATEMÁTICAS EXPONENCIALES
    const currentSData = botState.sStateData;
    const isFirstOrder = (currentSData.orderCountInCycle || 0) === 0;
    
    const currentTotalQty = isFirstOrder ? 0 : parseFloat(currentSData.ac || 0);
    const currentAI = isFirstOrder ? 0 : parseFloat(currentSData.ai || 0);
    
    const newTotalQty = currentTotalQty + executedQty;
    const newAI = currentAI + baseExecutedValue;
    const newPPC = newAI / newTotalQty; // Precio promedio donde "vendimos" el Short

    // 3. GESTIÓN DE CAPITAL
    const intendedCost = parseFloat(currentSData.lastOrder?.usdt_cost_real || 0);
    const refund = intendedCost > baseExecutedValue ? (intendedCost - baseExecutedValue) : 0;
    const finalSBalance = parseFloat(botState.sbalance || 0) + refund;

    // 4. ACTUALIZACIÓN DE TARGETS RESPECTO AL ANTERIOR
    const { price_var, size_var, purchaseUsdt, profit_percent } = botState.config.short;
    
    // Take Profit (Abajo): PPC * (1 - profit%)
    const newSTPrice = newPPC * (1 - (parseNumber(profit_percent) / 100));
    
    // LÓGICA EXPONENCIAL: Próxima cobertura es % arriba del PRECIO EJECUTADO ANTERIOR
    const newNextPrice = executedPrice * (1 + (parseNumber(price_var) / 100));
    
    // Recálculo de cobertura dinámica para el Dashboard
    const { coveragePrice, numberOfOrders } = calculateShortCoverage(
        finalSBalance, 
        executedPrice, // Base de precio anterior
        executedQty * executedPrice, // Base de capital anterior
        parseNumber(price_var)/100, 
        parseNumber(size_var)/100
    );

    // 5. PERSISTENCIA
    const SYMBOL = botState.config.symbol || 'BTC_USDT';
    await saveExecutedOrder({ ...orderDetails, symbol: SYMBOL, side: 'sell' }, SSTATE);

    await updateGeneralBotState({
        sbalance: finalSBalance,
        stprice: newSTPrice,
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
    
    log(`✅ [S-DATA] PPC: ${newPPC.toFixed(2)} | Sig. Venta: ${newNextPrice.toFixed(2)} | Pasos restantes: ${numberOfOrders}`, 'success');
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
        
        // Costo de recomprar el activo para cerrar la deuda
        const totalSpentToCover = (filledSize * buyPrice) * (1 + BUY_FEE_PERCENT);
        const profitNeto = totalUsdtReceivedFromSales - totalSpentToCover;

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

        // Recuperación total al balance del bot
        const newSBalance = botStateObj.sbalance + totalSpentToCover + profitNeto;
        
        await updateGeneralBotState({
            sbalance: newSBalance,
            total_profit: (botStateObj.total_profit || 0) + profitNeto,
            stprice: 0,
            scycle: (Number(botStateObj.scycle || 0) + 1)
        });

        // RESET TOTAL: Volvemos a la base de la pirámide exponencial
        await updateSStateData({
            ac: 0, ppc: 0, ai: 0, 
            orderCountInCycle: 0, 
            lastOrder: null,
            nextCoveragePrice: 0,
            cycleStartTime: null
        });

        log(`💰 [S-DATA] Short liquidado. Ganancia neta: +${profitNeto.toFixed(2)} USDT.`, 'success');
        
        // Transición de estado: Si stopAtCycle es true, se detiene; si no, vuelve a RUNNING para buscar nueva entrada.
        await updateBotState(config.short.stopAtCycle ? 'STOPPED' : 'RUNNING', SSTATE);

    } catch (error) {
        log(`❌ [S-DATA] Error crítico: ${error.message}`, 'error');
        if (updateSStateData) await updateSStateData({ 'lastOrder': null });
        throw error;
    }
}

module.exports = { handleSuccessfulShortSell, handleSuccessfulShortBuy };