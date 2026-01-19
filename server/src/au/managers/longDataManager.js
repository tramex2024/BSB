// BSB/server/src/au/states/long/LongDataManager.js

const { saveExecutedOrder } = require('../../../services/orderPersistenceService');
const { logSuccessfulCycle } = require('../../../services/cycleLogService');
const { calculateLongCoverage, parseNumber, getExponentialAmount } = require('../../../autobotCalculations');
const { CLEAN_LONG_ROOT } = require('../utils/cleanState');

const LSTATE = 'long';
const SELL_FEE_PERCENT = 0.001; // 0.1% BitMart Fee

/**
 * Procesa el éxito de una compra Long (Apertura o DCA).
 * Actualiza promedios y proyecta el siguiente escalón exponencial.
 */
async function handleSuccessfulBuy(botState, orderDetails, log, dependencies = {}) {
    const { updateGeneralBotState } = dependencies;
    
    const executedQty = parseFloat(orderDetails.filledSize || 0);
    const executedPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
    const baseExecutedValue = executedQty * executedPrice;

    if (executedQty <= 0 || executedPrice <= 0) {
        log('[L-DATA] ⚠️ Ejecución inválida capturada por el consolidador.', 'error');
        await updateGeneralBotState({ llastOrder: null });
        return;
    }

    // --- 1. CÁLCULOS DE ACUMULADOS (ESTRUCTURA PLANA) ---
    const currentBalance = parseFloat(botState.lbalance || 0);
    const finalizedLBalance = parseFloat((currentBalance - baseExecutedValue).toFixed(8));

    const isFirstOrder = (botState.locc || 0) === 0;
    
    const newTotalQty = parseFloat(((botState.lac || 0) + executedQty).toFixed(8)); 
    const newAI = (botState.lai || 0) + baseExecutedValue;
    const newPPC = newAI / newTotalQty; // Nuevo Precio Promedio de Compra
    const newOrderCount = (botState.locc || 0) + 1;

    // --- 2. PROYECCIÓN EXPONENCIAL ---
    const profitPercent = parseNumber(botState.config.long?.trigger || 0) / 100;
    const newLTPrice = newPPC * (1 + profitPercent); // Target de Venta (Take Profit)

    const { price_var, size_var, purchaseUsdt, price_step_inc } = botState.config.long || {};
    
    // Calculamos la distancia de la siguiente cobertura basándonos en el incremento exponencial de paso
    // Si es la primera orden (locc=0), la primera cobertura usa el price_var base.
    const priceVarDec = parseNumber(price_var || 0) / 100;
    const nextStepMult = Math.pow(1 + (parseNumber(price_step_inc || 0) / 100), newOrderCount - 1);
    const newNextPrice = executedPrice * (1 - (priceVarDec * nextStepMult));
    
    const nextRequiredAmount = getExponentialAmount(purchaseUsdt, newOrderCount, size_var);
    
    // --- 3. COBERTURA / RESISTENCIA REAL ---
    const { coveragePrice, numberOfOrders } = calculateLongCoverage(
        finalizedLBalance, 
        executedPrice, 
        purchaseUsdt, 
        priceVarDec, 
        parseNumber(size_var || 0),
        newOrderCount,
        parseNumber(price_step_inc || 0)
    );

    // Persistencia en DB de órdenes ejecutadas
    await saveExecutedOrder({ ...orderDetails, side: 'buy' }, LSTATE);

    // ✅ ACTUALIZACIÓN ATÓMICA EN RAÍZ
    await updateGeneralBotState({
        lbalance: finalizedLBalance,
        lac: newTotalQty,        // Long Accumulated Coins
        lai: newAI,             // Long Accumulated Investment
        lppc: newPPC,           // Long Price Per Coin
        locc: newOrderCount,    // Long Order Cycle Count
        ltprice: newLTPrice,    // Long Target Price
        lncp: newNextPrice,     // Long Next Coverage Price (Exponencial)
        lrca: nextRequiredAmount, // Long Required Coverage Amount (Exponencial)
        lcoverage: coveragePrice, // Precio de liquidación técnica (punto de quiebre de balance)
        lnorder: numberOfOrders, // Cuántas coberturas más soporta el balance
        llep: executedPrice,    // Last Long Execution Price
        llastOrder: null,       // Liberamos el sistema para la siguiente acción
        lstartTime: isFirstOrder ? new Date() : botState.lstartTime
    });

    log(`✅ [L-DATA] #${newOrderCount} Long. PPC: ${newPPC.toFixed(2)}. Target: ${newLTPrice.toFixed(2)}. Balance: $${finalizedLBalance.toFixed(2)}`, 'success');
}

/**
 * Procesa el cierre de ciclo (Take Profit) del Long.
 * Limpia la raíz y suma el beneficio neto.
 */
async function handleSuccessfulSell(botStateObj, orderDetails, dependencies) {
    const { config, log, updateBotState, updateGeneralBotState, logSuccessfulCycle } = dependencies;
    
    try {
        const totalBtcToSell = parseFloat(botStateObj.lac || 0);
        const sellPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
        
        // El Profit Neto descuenta la comisión de BitMart de la venta final
        const totalUsdtReceived = (totalBtcToSell * sellPrice) * (1 - SELL_FEE_PERCENT);
        const totalInvestment = parseFloat(botStateObj.lai || 0);
        const profitNeto = totalUsdtReceived - totalInvestment;

        // Registro en el Historial de Ciclos (TradeCycles)
        if (logSuccessfulCycle && botStateObj.lstartTime) {
            try {
                await logSuccessfulCycle({
                    autobotId: botStateObj._id,
                    symbol: botStateObj.config.symbol || 'BTC_USDT',
                    strategy: 'Long',
                    cycleIndex: (botStateObj.lcycle || 0) + 1,
                    startTime: botStateObj.lstartTime,
                    endTime: new Date(),
                    averagePPC: parseFloat(botStateObj.lppc || 0),
                    finalSellPrice: sellPrice,
                    orderCount: parseInt(botStateObj.locc || 0),
                    initialInvestment: totalInvestment,
                    finalRecovery: totalUsdtReceived,
                    netProfit: profitNeto,
                    profitPercentage: totalInvestment > 0 ? (profitNeto / totalInvestment) * 100 : 0
                });
            } catch (dbError) {
                log(`⚠️ Error al guardar historial Long: ${dbError.message}`, 'error');
            }
        }

        const newLBalance = parseFloat((botStateObj.lbalance + totalUsdtReceived).toFixed(8));
        const shouldStopLong = config.long?.stopAtCycle === true;

        // ✅ RESET TOTAL A RAÍZ: Deja el bot como nuevo para el siguiente ciclo
        await updateGeneralBotState({
            ...CLEAN_LONG_ROOT,
            lbalance: newLBalance,
            total_profit: (parseFloat(botStateObj.total_profit) || 0) + profitNeto,
            lcycle: (Number(botStateObj.lcycle || 0) + 1),
            'config.long.enabled': !shouldStopLong 
        });
        
        log(`💰 [L-DATA] Ciclo Long Cerrado: +${profitNeto.toFixed(2)} USDT. Profit Total: $${(botStateObj.total_profit + profitNeto).toFixed(2)}`, 'success');
        
        // Transición de estado: Si no debe parar, vuelve a BUYING para buscar la siguiente entrada
        await updateBotState(shouldStopLong ? 'STOPPED' : 'BUYING', LSTATE);

    } catch (error) {
        log(`🔥 [CRITICAL] Fallo en handleSuccessfulSell: ${error.message}`, 'error');
        throw error;
    }
}

module.exports = { handleSuccessfulBuy, handleSuccessfulSell };