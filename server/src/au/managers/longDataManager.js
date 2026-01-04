// BSB/server/src/au/managers/longDataManager.js

const { saveExecutedOrder } = require('../../../services/orderPersistenceService');
const { logSuccessfulCycle } = require('../../../services/cycleLogService');
const { calculateLongCoverage, parseNumber } = require('../../../autobotCalculations'); 

const LSTATE = 'long';
const SELL_FEE_PERCENT = 0.001; // 0.1%

/**
 * Maneja una COMPRA exitosa: Recalcula PPC, AC y ajusta el capital (LBalance).
 */
async function handleSuccessfulBuy(botState, orderDetails, log, dependencies = {}) {
    const { updateGeneralBotState, updateLStateData } = dependencies;
    
    // 1. Datos de ejecución
    const executedQty = parseFloat(orderDetails.filledSize || 0);
    const executedPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
    const baseExecutedCost = executedQty * executedPrice;

    if (executedQty <= 0 || executedPrice <= 0) {
        log('⚠️ Error: Compra reportada con volumen/precio cero. Limpiando orden.', 'error');
        if (updateLStateData) await updateLStateData({ 'lastOrder': null });
        return;
    }

    // 2. Matemáticas de Posición (PPC y AC)
    const isFirstOrder = (botState.lStateData.orderCountInCycle || 0) === 0;
    const currentTotalQty = isFirstOrder ? 0 : parseFloat(botState.lStateData.ac || 0);
    const currentAI = isFirstOrder ? 0 : parseFloat(botState.lStateData.ai || 0);
    
    const newTotalQty = currentTotalQty + executedQty;
    const newAI = currentAI + baseExecutedCost;
    const newPPC = newAI / newTotalQty;

    // 3. Gestión de Capital (Devolución de sobras del exchange al bot)
    const intendedCost = parseFloat(botState.lStateData.lastOrder?.usdt_cost_real || 0);
    const refund = intendedCost > baseExecutedCost ? (intendedCost - baseExecutedCost) : 0;
    const finalLBalance = (parseFloat(botState.lbalance || 0)) + refund;

    // 4. Recálculo de Targets (TP y DCA)
    const { price_var, size_var, purchaseUsdt, profit_percent } = botState.config.long;
    const newLTPrice = newPPC * (1 + (parseNumber(profit_percent) / 100));
    const newNextPrice = executedPrice * (1 - (parseNumber(price_var) / 100));
    
    // Nueva cobertura basada en capital restante
    const { coveragePrice, numberOfOrders } = calculateLongCoverage(
        finalLBalance, newPPC, purchaseUsdt, 
        parseNumber(price_var)/100, parseNumber(size_var)/100
    );

    // 5. PERSISTENCIA ATÓMICA (Usando la Caja de Cambios)
    const SYMBOL = botState.config.symbol || 'BTC_USDT';
    await saveExecutedOrder({ ...orderDetails, symbol: SYMBOL }, 'long');

    const updatePayload = {
        lbalance: finalLBalance,
        ltprice: newLTPrice,
        lcoverage: coveragePrice,
        lnorder: numberOfOrders,
        lStateData: {
            ...botState.lStateData,
            ac: newTotalQty,
            ai: newAI,
            ppc: newPPC,
            lastOrder: null,
            nextCoveragePrice: newNextPrice,
            orderCountInCycle: (botState.lStateData.orderCountInCycle || 0) + 1,
            cycleStartTime: isFirstOrder ? new Date() : botState.lStateData.cycleStartTime
        }
    };

    if (updateGeneralBotState) {
        await updateGeneralBotState(updatePayload);
    }
    
    log(`✅ [LONG] Compra Consolidada. Nuevo PPC: ${newPPC.toFixed(2)} | Balance Bot: ${finalLBalance.toFixed(2)}`, 'success');
}

/**
 * Maneja una VENTA exitosa: Cierra ciclo, registra ganancia y resetea datos.
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

        // Guardar en historial
        await saveExecutedOrder({ ...orderDetails, side: 'sell' }, LSTATE);

        // Registro de Ciclo
        if (botStateObj.lStateData.cycleStartTime) {
            await logSuccessfulCycle({
                strategy: 'Long', 
                cycleIndex: (botStateObj.lcycle || 0) + 1,
                netProfit: profitNeto,
                initialInvestment: totalUsdtSpent,
                finalRecovery: totalRecoveredNeto
            });
        }

        // Resetear y actualizar balance general
        const newLBalance = botStateObj.lbalance + totalRecoveredNeto;
        
        await updateGeneralBotState({
            lbalance: newLBalance,
            total_profit: (botStateObj.total_profit || 0) + profitNeto,
            ltprice: 0,
            lcycle: isFullSell ? (Number(botStateObj.lcycle || 0) + 1) : Number(botStateObj.lcycle || 0)
        });

        if (isFullSell) {
            await updateLStateData({ ac: 0, ppc: 0, ai: 0, orderCountInCycle: 0, lastOrder: null });
            await updateBotState(config.long.stopAtCycle ? 'STOPPED' : 'BUYING', LSTATE);
        } else {
            // Si fue parcial, restamos y seguimos vendiendo
            const remainingAc = Math.max(0, botStateObj.lStateData.ac - filledSize);
            await updateLStateData({ ac: remainingAc, ai: (botStateObj.lStateData.ppc * remainingAc), lastOrder: null });
            await updateBotState('SELLING', LSTATE);
        }

        log(`💰 [CIERRE] Ciclo completado. Ganancia: +${profitNeto.toFixed(2)} USDT.`, 'success');

    } catch (error) {
        log(`❌ Error crítico en cierre de venta: ${error.message}`, 'error');
        throw error;
    }
}

module.exports = { handleSuccessfulBuy, handleSuccessfulSell };