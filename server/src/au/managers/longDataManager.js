// BSB/server/src/au/managers/longDataManager.js

const { saveExecutedOrder } = require('../../../services/orderPersistenceService');
const { logSuccessfulCycle } = require('../../../services/cycleLogService');
const { calculateLongCoverage, parseNumber } = require('../../../autobotCalculations'); 

const LSTATE = 'long';
const SELL_FEE_PERCENT = 0.001; // 0.1%

/**
 * Maneja una COMPRA exitosa: Recalcula la posición basándose en la última ejecución.
 */
async function handleSuccessfulBuy(botState, orderDetails, log, dependencies = {}) {
    const { updateGeneralBotState, updateLStateData } = dependencies;
    
    // 1. Datos reales de la ejecución en BitMart
    const executedQty = parseFloat(orderDetails.filledSize || 0);
    const executedPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
    const baseExecutedCost = executedQty * executedPrice;

    if (executedQty <= 0 || executedPrice <= 0) {
        log('⚠️ [L-DATA] Compra con volumen/precio cero. Abortando consolidación.', 'error');
        if (updateLStateData) await updateLStateData({ 'lastOrder': null });
        return;
    }

    // 2. LÓGICA DE POSICIÓN
    const currentLData = botState.lStateData;
    const isFirstOrder = (currentLData.orderCountInCycle || 0) === 0;
    
    const currentTotalQty = isFirstOrder ? 0 : parseFloat(currentLData.ac || 0);
    const currentAI = isFirstOrder ? 0 : parseFloat(currentLData.ai || 0);
    
    const newTotalQty = currentTotalQty + executedQty;
    const newAI = currentAI + baseExecutedCost;
    const newPPC = newAI / newTotalQty;

    // 3. GESTIÓN DE CAPITAL (Deducción exacta)
    // Devolvemos al balance lo que el bot bloqueó "de más" por volatilidad
    const intendedCost = parseFloat(currentLData.lastOrder?.usdt_cost_real || 0);
    const refund = intendedCost > baseExecutedCost ? (intendedCost - baseExecutedCost) : 0;
    const finalLBalance = parseFloat(botState.lbalance || 0) + refund;

    // 4. ACTUALIZACIÓN EXPONENCIAL DE TARGETS
    const { price_var, size_var, purchaseUsdt, profit_percent } = botState.config.long;
    
    // El Take Profit siempre se calcula sobre el PPC acumulado
    const newLTPrice = newPPC * (1 + (parseNumber(profit_percent) / 100));
    
    // LÓGICA EXPONENCIAL: El próximo precio de cobertura es respecto al PRECIO DE EJECUCIÓN ACTUAL
    const newNextPrice = executedPrice * (1 - (parseNumber(price_var) / 100));
    
    // Recalcular cuántas órdenes exponenciales nos quedan con el balance real
    const { coveragePrice, numberOfOrders } = calculateLongCoverage(
        finalLBalance, 
        executedPrice, // Base para la siguiente caída
        executedQty * executedPrice, // Monto de la "última" para calcular la "siguiente"
        parseNumber(price_var)/100, 
        parseNumber(size_var)/100
    );

    // 5. PERSISTENCIA
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
            lastOrder: null, // Liberamos el bloqueo
            nextCoveragePrice: newNextPrice, // Guardamos para LBuying.js
            orderCountInCycle: (currentLData.orderCountInCycle || 0) + 1,
            cycleStartTime: isFirstOrder ? new Date() : currentLData.cycleStartTime
        }
    });
    
    log(`✅ [L-DATA] PPC: ${newPPC.toFixed(2)} | Sig. Compra: ${newNextPrice.toFixed(2)} | Órdenes Restantes: ${numberOfOrders}`, 'success');
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
        
        // Verificamos si se vendió al menos el 99% (por temas de decimales)
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
            // RESET TOTAL: Volvemos a la base (ej. 5 USDT)
            await updateGeneralBotState({
                lbalance: newLBalance,
                total_profit: (botStateObj.total_profit || 0) + profitNeto,
                ltprice: 0,
                lcycle: (Number(botStateObj.lcycle || 0) + 1)
            });

            await updateLStateData({ 
                ac: 0, ppc: 0, ai: 0, 
                orderCountInCycle: 0, 
                lastOrder: null,
                nextCoveragePrice: 0 
            });

            log(`💰 [L-DATA] Ciclo cerrado. Profit: +${profitNeto.toFixed(2)} USDT.`, 'success');
            await updateBotState(config.long.stopAtCycle ? 'STOPPED' : 'BUYING', LSTATE);
        } else {
            // Venta parcial (raro en market, pero posible)
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