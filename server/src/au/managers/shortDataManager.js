// BSB/server/src/au/managers/shortDataManager.js

const { saveExecutedOrder } = require('../../../services/orderPersistenceService');
const { logSuccessfulCycle } = require('../../../services/cycleLogService');
const { calculateShortCoverage, parseNumber, getExponentialAmount } = require('../../../autobotCalculations'); 
const { CLEAN_SHORT_ROOT } = require('../utils/cleanState');

const SSTATE = 'short';
const BUY_FEE_PERCENT = 0.001; // 0.1% BitMart Fee

/**
 * Maneja el éxito de una VENTA (Apertura o DCA Short).
 */
async function handleSuccessfulShortSell(botState, orderDetails, log, dependencies = {}) {
    // Extraemos userId de las dependencias
    const { updateGeneralBotState, userId } = dependencies;
    
    const orderId = String(orderDetails.orderId || orderDetails.order_id);
    const executedQty = parseFloat(orderDetails.filledSize || 0);
    const executedPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
    const baseExecutedValue = executedQty * executedPrice;

    // 1. Evitar procesar dos veces la misma orden
    if (botState.slastOrder === null && botState.slep === executedPrice) {
        log(`[S-DATA] ⚠️ Duplicado detectado para orden ${orderId}.`, 'warning');
        return;
    }

    if (executedQty <= 0 || executedPrice <= 0) {
        log('[S-DATA] ⚠️ Ejecución Short inválida.', 'error');
        return;
    }

    // 2. Cálculos de balance y promedios
    const currentSBalance = parseFloat(botState.sbalance || 0);
    const finalizedSBalance = parseFloat((currentSBalance - baseExecutedValue).toFixed(8));

    const currentAC = parseFloat(botState.sac || 0); 
    const currentAI = parseFloat(botState.sai || 0); 
    const currentOCC = parseInt(botState.socc || 0); 
    
    const isFirstOrder = currentOCC === 0;
    
    const newAC = parseFloat((currentAC + executedQty).toFixed(8)); 
    const newAI = currentAI + baseExecutedValue;
    const newPPC = newAI / newAC; 
    const newOCC = currentOCC + 1;

    // 3. Nuevos targets basados en config del usuario
    const profitTrigger = parseNumber(botState.config.short?.profit_percent || 0) / 100;
    const newSTPrice = newPPC * (1 - profitTrigger);

    const { price_var, size_var, purchaseUsdt } = botState.config.short || {};
    const newNCP = executedPrice * (1 + (parseNumber(price_var) / 100)); 
    const nextRCA = getExponentialAmount(purchaseUsdt, newOCC, size_var);
    
    const { coveragePrice, numberOfOrders } = calculateShortCoverage(
        finalizedSBalance, 
        executedPrice, 
        purchaseUsdt, 
        parseNumber(price_var) / 100, 
        parseNumber(size_var),
        newOCC
    );

    // 4. PERSISTENCIA: Pasamos el userId para que la orden se guarde en su cuenta
    await saveExecutedOrder({ ...orderDetails, side: 'sell' }, SSTATE, userId);

    await updateGeneralBotState({
        sac: newAC,
        sai: newAI,
        sppc: newPPC,
        socc: newOCC,        
        slep: executedPrice, 
        sncp: newNCP,        
        srca: nextRCA,       
        stprice: newSTPrice,
        spc: 0,              
        spm: 0,              
        sbalance: finalizedSBalance,
        scoverage: coveragePrice, 
        snorder: numberOfOrders,   
        sstartTime: isFirstOrder ? new Date() : botState.sstartTime,
        slastOrder: null     
    });
    
    log(`✅ [S-DATA] DCA #${newOCC} Confirmado. PPC: ${newPPC.toFixed(2)}. Target: $${newSTPrice.toFixed(2)}.`, 'success');
}

/**
 * Maneja el éxito de una COMPRA (Cierre de Ciclo / Take Profit).
 */
async function handleSuccessfulShortBuy(botStateObj, orderDetails, dependencies) {
    const { userId, config, log, updateBotState, updateGeneralBotState, logSuccessfulCycle } = dependencies;
    
    try {
        const buyPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
        const filledSize = parseFloat(orderDetails.filledSize || 0); 
        
        // El profit en Short es: Lo que recibí al vender - Lo que gasté al recomprar
        const totalUsdtReceivedFromSales = parseFloat(botStateObj.sai || 0); 
        const totalSpentToCover = (filledSize * buyPrice) * (1 + BUY_FEE_PERCENT);
        const profitNeto = totalUsdtReceivedFromSales - totalSpentToCover;

        const finalizedSBalance = parseFloat(((parseFloat(botStateObj.sbalance) || 0) + totalUsdtReceivedFromSales + profitNeto).toFixed(8));

        // 1. Guardar orden de cierre vinculada al usuario
        try {
            await saveExecutedOrder({ 
                ...orderDetails, 
                side: 'buy',
                status: 'filled',
                filledSize: filledSize,
                priceAvg: buyPrice,
                timestamp: Date.now()
            }, SSTATE, userId);
        } catch (saveError) {
            log(`⚠️ Error al persistir compra Short en BD: ${saveError.message}`, 'error');
        }

        // 2. Registrar ciclo exitoso en el historial del usuario
        if (logSuccessfulCycle && botStateObj.sstartTime) {
            try {
                await logSuccessfulCycle({
                    userId, // <--- PROPIETARIO DEL PROFIT
                    autobotId: botStateObj._id,
                    symbol: botStateObj.config?.symbol || 'BTC_USDT',
                    strategy: 'Short',
                    cycleIndex: (botStateObj.scycle || 0) + 1,
                    startTime: botStateObj.sstartTime,
                    endTime: new Date(),
                    averagePPC: parseFloat(botStateObj.sppc || 0),
                    finalSellPrice: buyPrice, 
                    orderCount: parseInt(botStateObj.socc || 0),
                    initialInvestment: totalUsdtReceivedFromSales,
                    finalRecovery: totalSpentToCover,
                    netProfit: profitNeto,
                    profitPercentage: (profitNeto / totalUsdtReceivedFromSales) * 100
                });
            } catch (dbError) {
                log(`⚠️ Historial Short: Error al guardar.`, 'error');
            }
        }

        const shouldStopShort = config.short?.stopAtCycle === true;

        // 3. Limpieza de estado y actualización de balance
        await updateGeneralBotState({
            ...CLEAN_SHORT_ROOT,
            sbalance: finalizedSBalance,
            total_profit: (parseFloat(botStateObj.total_profit) || 0) + profitNeto,
            scycle: (Number(botStateObj.scycle || 0) + 1),
            'config.short.enabled': !shouldStopShort
        });

        log(`💰 [S-DATA] Ciclo Short Cerrado. Profit: +${profitNeto.toFixed(2)} USDT.`, 'success');
        
        await updateBotState(shouldStopShort ? 'STOPPED' : 'RUNNING', SSTATE);

    } catch (error) {
        log(`❌ [S-DATA] Error crítico en cierre Short: ${error.message}`, 'error');
        throw error;
    }
}

module.exports = { handleSuccessfulShortSell, handleSuccessfulShortBuy };