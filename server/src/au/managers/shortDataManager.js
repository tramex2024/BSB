// BSB/server/src/au/managers/shortDataManager.js (ESPEJO DE longDataManager.js)

const Autobot = require('../../../models/Autobot');
const { saveExecutedOrder } = require('../../../services/orderPersistenceService');
const { logSuccessfulCycle } = require('../../../services/cycleLogService');
const { calculateShortCoverage, parseNumber } = require('../../../autobotCalculations'); 

const SSTATE = 'short';
const BUY_FEE_PERCENT = 0.001; // 0.1% (Comisión al recomprar para cerrar)

/**
 * Maneja una VENTA exitosa (Apertura o DCA de Short) y actualiza la posición.
 */
async function handleSuccessfulShortSell(botState, orderDetails, log) {
    // --- 1. EXTRACCIÓN Y CÁLCULO ---
    const executedQty = parseFloat(orderDetails.filledSize || 0);
    const executedPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
    const baseExecutedValue = executedQty * executedPrice;
    const executedFee = parseFloat(orderDetails.fee || 0);
    const executedNotional = parseFloat(orderDetails.notional || 0);
    
    // En Short, el capital invertido (AI) es el valor de lo que vendimos MENOS el fee
    const actualExecutedValue = (executedNotional > 0 ? executedNotional : baseExecutedValue) - executedFee; 

    if (executedQty <= 0 || executedPrice <= 0) {
        log('[S] Error: Ejecución de venta con valores cero. Limpiando lastOrder.', 'error');
        await Autobot.findOneAndUpdate({}, { $set: { 'sStateData.lastOrder': null } });
        return;
    }

    // --- 2. CÁLCULO DE PPC Y AC (Acumulado de Short) ---
    const isFirstOrder = (botState.sStateData.orderCountInCycle || 0) === 0;
    const currentTotalQty = isFirstOrder ? 0 : parseFloat(botState.sStateData.ac || 0);
    const currentAI = isFirstOrder ? 0 : parseFloat(botState.sStateData.ai || 0);
    
    const newTotalQty = currentTotalQty + executedQty;
    const newAI = currentAI + actualExecutedValue;

    // El PPC en Short es el precio promedio al que hemos VENDIDO
    let newPPC = newTotalQty > 0 ? newAI / newTotalQty : 0;

    // --- 3. GESTIÓN DEL CAPITAL RESTANTE (SBalance y Refund) ---
    const intendedUsdtBlocked = parseFloat(botState.sStateData.lastOrder?.usdt_cost_real || 0);
    const refundAmount = intendedUsdtBlocked - (executedNotional || baseExecutedValue);
    let finalSBalance = parseFloat(botState.sbalance || 0);

    if (refundAmount > 0.01) {
        finalSBalance += refundAmount;
        log(`[S] Reembolso: ${refundAmount.toFixed(2)} USDT al SBalance.`, 'info');
    }

    // --- 4. CÁLCULO DE TARGETS SHORT ---
    const { price_var, size_var, purchaseUsdt, profit_percent } = botState.config.short;
    const priceVarDec = parseNumber(price_var) / 100;
    const sizeVarDec = parseNumber(size_var) / 100;

    // En Short, la cobertura es ARRIBA
    const newNextCoveragePrice = executedPrice * (1 + priceVarDec);
    const lastAmount = parseFloat(botState.sStateData.lastOrder?.usdt_amount || purchaseUsdt);
    const newReqAmount = lastAmount * (1 + sizeVarDec);

    // En Short, el TP es ABAJO
    const profitDec = parseNumber(profit_percent) / 100;
    const newSTPrice = newPPC * (1 - profitDec);

    // Cobertura dinámica
    const { coveragePrice: newSCoverage, numberOfOrders: newSNOrder } = calculateShortCoverage(
        finalSBalance, newPPC, purchaseUsdt, priceVarDec, sizeVarDec, (botState.sStateData.orderCountInCycle || 0) + 1
    );

    // --- 5. ACTUALIZACIÓN ATÓMICA ---
    const SYMBOL = botState.config.symbol || 'BTC_USDT';
    await saveExecutedOrder({ ...orderDetails, symbol: SYMBOL, side: 'sell' }, SSTATE);

    const atomicUpdate = {
        $set: {
            'sbalance': finalSBalance,
            'stprice': newSTPrice,
            'scoverage': newSCoverage,
            'snorder': newSNOrder,
            'sStateData.ac': newTotalQty,
            'sStateData.ai': newAI,
            'sStateData.ppc': newPPC,
            'sStateData.lastExecutionPrice': executedPrice,
            'sStateData.nextCoveragePrice': newNextCoveragePrice,
            'sStateData.requiredCoverageAmount': newReqAmount,
            'sStateData.lastOrder': null,
            ...(isFirstOrder && { 'sStateData.cycleStartTime': new Date() }),
        },
        $inc: {
            'sStateData.orderCountInCycle': 1,
            ...(isFirstOrder && { 'scycle': 1 }),
        }
    };

    await Autobot.findOneAndUpdate({}, atomicUpdate);
    log(`[SHORT] Venta Consolidada. PPC: ${newPPC.toFixed(2)}, Deuda BTC (AC): ${newTotalQty.toFixed(8)}.`, 'success');
}

/**
 * Maneja una COMPRA exitosa (Cierre de Short/Profit) y resetea el ciclo.
 */
async function handleSuccessfulShortBuy(botStateObj, orderDetails, dependencies) {
    const { config, log, updateBotState, updateSStateData, updateGeneralBotState } = dependencies;
    
    try {
        const totalUsdtReceivedFromSales = botStateObj.sStateData.ai; // Lo que obtuvimos al vender
        const buyPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
        const filledSize = parseFloat(orderDetails.filled_volume || orderDetails.filledSize || 0); 
        
        if (filledSize <= 0 || buyPrice <= 0) {
            log('[S] Error: Recompra sin volumen o precio. Abortando.', 'error');
            await updateSStateData({ 'lastOrder': null }); 
            throw new Error("Recompra de Short fallida."); 
        }

        // Costo de recomprar los activos para devolverlos
        const totalUsdtSpentToCoverBRUTO = filledSize * buyPrice;
        const buyFeeUsdt = totalUsdtSpentToCoverBRUTO * BUY_FEE_PERCENT;    
        const totalUsdtSpentToCoverNETO = totalUsdtSpentToCoverBRUTO + buyFeeUsdt;

        // Ganancia = (Lo que cobré al vender) - (Lo que pagué al recomprar)
        const profitNETO = totalUsdtReceivedFromSales - totalUsdtSpentToCoverNETO;

        // Registro Histórico
        const SYMBOL = config.symbol || 'BTC_USDT';
        await saveExecutedOrder({ ...orderDetails, symbol: SYMBOL, side: 'buy' }, SSTATE);

        const cycleStartTime = botStateObj.sStateData.cycleStartTime;
        if (cycleStartTime) {
            const cycleData = {
                strategy: 'Short', cycleIndex: (botStateObj.scycle || 0) + 1, symbol: SYMBOL,
                startTime: cycleStartTime, endTime: new Date(),
                initialInvestment: totalUsdtReceivedFromSales, finalRecovery: totalUsdtSpentToCoverNETO,
                netProfit: profitNETO, profitPercentage: (profitNETO / totalUsdtReceivedFromSales) * 100,
                averagePPC: botStateObj.sStateData.ppc, finalSellPrice: buyPrice,
                orderCount: botStateObj.sStateData.orderCountInCycle, autobotId: botStateObj._id    
            };
            await logSuccessfulCycle(cycleData);
            log(`[S] Ciclo Short ${cycleData.cycleIndex} cerrado. Profit: ${profitNETO.toFixed(2)} USDT.`, 'success');
        }

        // Recuperación de capital: SBalance inicial + lo que sobró (profit) + el capital usado (ai)
        // Simplificado: El SBalance nuevo es el actual + el profit neto + el capital "ai" que estaba fuera.
        const newSBalance = botStateObj.sbalance + totalUsdtReceivedFromSales + profitNETO;

        // Reset de cobertura
        const { coveragePrice: newSCoverageReset, numberOfOrders: newSNOrderReset } = calculateShortCoverage(
            newSBalance, buyPrice, config.short.purchaseUsdt, 
            parseNumber(config.short.price_var) / 100, parseNumber(config.short.size_var) / 100
        );

        await updateGeneralBotState({
            sbalance: newSBalance,
            total_profit: (botStateObj.total_profit || 0) + profitNETO,
            stprice: 0, ssprice: 0,
            scoverage: newSCoverageReset,
            snorder: newSNOrderReset,
            scycle: (botStateObj.scycle || 0) + 1
        });

        await updateSStateData({
            ac: 0, ppc: 0, ai: 0, orderCountInCycle: 0, lastOrder: null, pm: 0, pc: 0,
            lastExecutionPrice: 0, nextCoveragePrice: 0, requiredCoverageAmount: 0,
            cycleStartTime: null
        });

        // Transición
        const nextState = config.short.stopAtCycle ? 'STOPPED' : 'RUNNING';
        await updateBotState(nextState, SSTATE);

    } catch (error) {
        log(`[S] Error en cierre de Short: ${error.message}`, 'error');
        await updateSStateData({ 'lastOrder': null });
        throw error;
    }
}

module.exports = {
    handleSuccessfulShortSell,
    handleSuccessfulShortBuy
};