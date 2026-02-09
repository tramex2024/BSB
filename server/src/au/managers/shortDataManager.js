// BSB/server/src/au/managers/shortDataManager.js

const { saveExecutedOrder } = require('../../../services/orderPersistenceService');
const { logSuccessfulCycle } = require('../../../services/cycleLogService');
const { calculateShortCoverage, parseNumber, getExponentialAmount } = require('../../../autobotCalculations'); 
const { CLEAN_SHORT_ROOT } = require('../utils/cleanState');

const SSTATE = 'short';
const BUY_FEE_PERCENT = 0.001; // 0.1% BitMart Fee

/**
 * Maneja el éxito de una VENTA (Apertura o DCA Short).
 * Registra cuánto activo hemos "prestado/vendido" para recomprar luego.
 */
async function handleSuccessfulShortSell(botState, orderDetails, log, dependencies = {}) {
    const { updateGeneralBotState, userId } = dependencies;
    
    const orderId = String(orderDetails.orderId || orderDetails.order_id);
    const executedQty = parseFloat(orderDetails.filledSize || 0);
    const executedPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
    const baseExecutedValue = executedQty * executedPrice;

    // 1. Prevención de duplicados por tick
    if (botState.slastOrder === null && botState.slep === executedPrice) {
        return;
    }

    if (executedQty <= 0 || executedPrice <= 0) {
        log('[S-DATA] ⚠️ Datos de ejecución Short inconsistentes.', 'error');
        return;
    }

    // 2. Cálculos de posición (Short Accumulated)
    const currentSBalance = parseFloat(botState.sbalance || 0);
    // Restamos del balance lo invertido en esta venta (margen utilizado)
    const finalizedSBalance = parseFloat((currentSBalance - baseExecutedValue).toFixed(8));

    const currentAC = parseFloat(botState.sac || 0);  // Cantidad de BTC vendidos
    const currentAI = parseFloat(botState.sai || 0);  // USDT recibidos por esas ventas
    const currentOCC = parseInt(botState.socc || 0);  
    
    const isFirstOrder = currentOCC === 0;
    
    const newAC = parseFloat((currentAC + executedQty).toFixed(8)); 
    const newAI = currentAI + baseExecutedValue;
    const newPPC = newAI / newAC; // Precio promedio de venta
    const newOCC = currentOCC + 1;

    // 3. Definición de Targets (Profit hacia abajo, DCA hacia arriba)
    const profitTrigger = parseNumber(botState.config.short?.profit_percent || 0) / 100;
    const newSTPrice = newPPC * (1 - profitTrigger); // Precio al que queremos recomprar

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

    // 4. PERSISTENCIA ATÓMICA
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
    
    log(`✅ [S-DATA] Orden #${newOCC} integrada. PPC Venta: ${newPPC.toFixed(2)}. Target Recompra: $${newSTPrice.toFixed(2)}.`, 'success');
}

/**
 * Maneja el éxito de una COMPRA (Cierre de Ciclo / Take Profit).
 * Calcula el beneficio neto restando lo gastado en la recompra de lo recibido en las ventas.
 */
async function handleSuccessfulShortBuy(botStateObj, orderDetails, dependencies) {
    const { userId, config, log, updateBotState, updateGeneralBotState, logSuccessfulCycle } = dependencies;
    
    try {
        const buyPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
        const filledSize = parseFloat(orderDetails.filledSize || 0); 
        
        // CÁLCULO DE PROFIT SHORT:
        // (USDT Recibidos en Ventas) - (USDT Gastados en Recompra + Comisiones)
        const totalUsdtReceivedFromSales = parseFloat(botStateObj.sai || 0); 
        const totalSpentToCover = (filledSize * buyPrice) * (1 + BUY_FEE_PERCENT);
        const profitNeto = totalUsdtReceivedFromSales - totalSpentToCover;

        // Recuperamos el capital inicial + la ganancia
        const finalizedSBalance = parseFloat(((parseFloat(botStateObj.sbalance) || 0) + totalUsdtReceivedFromSales + profitNeto).toFixed(8));

        // 1. Guardar orden de cierre
        await saveExecutedOrder({ 
            ...orderDetails, 
            side: 'buy',
            status: 'filled',
            filledSize: filledSize,
            priceAvg: buyPrice,
            timestamp: Date.now()
        }, SSTATE, userId);

        // 2. Registrar ciclo en historial para el Dashboard del usuario
        if (logSuccessfulCycle && botStateObj.sstartTime) {
            await logSuccessfulCycle({
                userId, 
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
        }

        const shouldStopShort = config.short?.stopAtCycle === true;

        // 3. RESET DE ESTADO (Limpieza de raíz Short)
        await updateGeneralBotState({
            ...CLEAN_SHORT_ROOT,
            sbalance: finalizedSBalance,
            total_profit: (parseFloat(botStateObj.total_profit) || 0) + profitNeto,
            scycle: (Number(botStateObj.scycle || 0) + 1),
            'config.short.enabled': !shouldStopShort
        });

        log(`💰 [S-DATA] Ciclo Short Cerrado. Profit: +${profitNeto.toFixed(2)} USDT.`, 'success');
        
        // Transición de estado
        await updateBotState(shouldStopShort ? 'STOPPED' : 'RUNNING', SSTATE);

    } catch (error) {
        log(`❌ [S-DATA] Error en liquidación Short: ${error.message}`, 'error');
        throw error;
    }
}

module.exports = { handleSuccessfulShortSell, handleSuccessfulShortBuy };