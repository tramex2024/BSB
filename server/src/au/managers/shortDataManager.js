// BSB/server/src/au/managers/shortDataManager.js

const { saveExecutedOrder } = require('../../../services/orderPersistenceService');
const { logSuccessfulCycle } = require('../../../services/cycleLogService');
const { calculateShortCoverage, parseNumber, getExponentialAmount } = require('../../../autobotCalculations'); 

const SSTATE = 'short';
const BUY_FEE_PERCENT = 0.001; 

/**
 * Maneja el éxito de una VENTA (Apertura o DCA).
 */
async function handleSuccessfulShortSell(botState, orderDetails, log, dependencies = {}) {
    const { updateGeneralBotState, updateSStateData } = dependencies;
    
    const executedQty = parseFloat(orderDetails.filledSize || 0);
    const executedPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
    const baseExecutedValue = executedQty * executedPrice;

    if (executedQty <= 0 || executedPrice <= 0) {
        log('[S-DATA] ⚠️ Ejecución Short inválida.', 'error');
        return;
    }

    // --- 1. SANEAMIENTO DE BALANCE Y ACUMULADOS EN RAÍZ ---
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

    // --- 2. CÁLCULO DE TARGETS Y LÓGICA EXPONENCIAL ---
    const profitTrigger = parseNumber(botState.config.short?.trigger || 0) / 100;
    const newSPC = newPPC * (1 - profitTrigger); 

    const { price_var, size_var, purchaseUsdt } = botState.config.short || {};
    
    const newNCP = executedPrice * (1 + (parseNumber(price_var) / 100)); 

    const nextRCA = getExponentialAmount(purchaseUsdt, newOCC, size_var);
    
    // --- 3. CÁLCULO DE RESISTENCIA ---
    const { coveragePrice, numberOfOrders } = calculateShortCoverage(
        finalizedSBalance, 
        executedPrice, 
        purchaseUsdt, 
        parseNumber(price_var) / 100, 
        parseNumber(size_var),
        newOCC
    );

    // --- 4. PERSISTENCIA Y ACTUALIZACIÓN DE RAÍZ ---
    await saveExecutedOrder({ ...orderDetails, side: 'sell' }, SSTATE);

    await updateGeneralBotState({
        sac: newAC,
        sai: newAI,
        sppc: newPPC,
        socc: newOCC,        
        slep: executedPrice, 
        sncp: newNCP,        
        srca: nextRCA,       
        spc: newSPC,         
        sbalance: finalizedSBalance,
        scoverage: coveragePrice, 
        snorder: numberOfOrders,   
        sstartTime: isFirstOrder ? new Date() : botState.sstartTime,
        slastOrder: null // ✅ Limpiamos la orden para permitir la siguiente o el TP
    });
    
    log(`✅ [S-DATA] #${newOCC} Short. PPC: ${newPPC.toFixed(2)}. Sig. orden: $${nextRCA.toFixed(2)}. Resistencia: ${numberOfOrders} órdenes.`, 'success');
}

/**
 * Maneja el éxito de una COMPRA (Take Profit).
 */
async function handleSuccessfulShortBuy(botStateObj, orderDetails, dependencies) {
    const { config, log, updateBotState, updateGeneralBotState, logSuccessfulCycle } = dependencies;
    
    try {
        const buyPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
        const filledSize = parseFloat(orderDetails.filledSize || 0); 
        
        const totalUsdtReceivedFromSales = parseFloat(botStateObj.sai || 0); 
        const totalSpentToCover = (filledSize * buyPrice) * (1 + BUY_FEE_PERCENT);
        const profitNeto = totalUsdtReceivedFromSales - totalSpentToCover;

        const finalizedSBalance = parseFloat(((parseFloat(botStateObj.sbalance) || 0) + totalUsdtReceivedFromSales + profitNeto).toFixed(8));

        await saveExecutedOrder({ ...orderDetails, side: 'buy' }, SSTATE);

        // --- REGISTRO DE CICLO ---
        if (logSuccessfulCycle && botStateObj.sstartTime) {
            try {
                await logSuccessfulCycle({
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
                log(`⚠️ Error al guardar historial Short: ${dbError.message}`, 'error');
            }
        }

        const shouldStopShort = config.short?.stopAtCycle === true;

        // --- RESETEO TOTAL DE LA RAÍZ ---
        await updateGeneralBotState({
            sac: 0,
            sai: 0,
            sppc: 0,
            socc: 0,
            slep: 0,
            sncp: 0,
            srca: 0,
            spc: 0,
            spm: 0,
            sstartTime: null,
            scoverage: 0,
            snorder: 0,
            slastOrder: null, // ✅ Limpieza fundamental
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