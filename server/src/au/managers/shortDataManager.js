// BSB/server/src/au/managers/shortDataManager.js

const { saveExecutedOrder } = require('../../../services/orderPersistenceService');
const { logSuccessfulCycle } = require('../../../services/cycleLogService');
const { calculateShortCoverage, parseNumber, getExponentialAmount } = require('../../../autobotCalculations'); 

const SSTATE = 'short';
const BUY_FEE_PERCENT = 0.001; // Comisión estimada de BitMart (0.1%)

/**
 * Maneja el éxito de una VENTA (Apertura o DCA Short).
 * Recalcula PPC, cobertura y siguiente precio de disparo.
 */
async function handleSuccessfulShortSell(botState, orderDetails, log, dependencies = {}) {
    const { updateGeneralBotState } = dependencies;
    
    // 1. EXTRAER DATOS REALES DE LA ORDEN
    const orderId = String(orderDetails.orderId || orderDetails.order_id);
    const executedQty = parseFloat(orderDetails.filledSize || 0);
    const executedPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
    const baseExecutedValue = executedQty * executedPrice;

    // 🛡️ SEGURIDAD: Evitar doble procesamiento
    // Si el slep (último precio) es igual al actual y el slastOrder ya es null, 
    // o si el ID coincide con algún registro previo, abortamos.
    if (botState.slastOrder === null && botState.slep === executedPrice) {
        log(`[S-DATA] ⚠️ Intento de duplicado detectado para orden ${orderId}. Ignorando...`, 'warning');
        return;
    }

    if (executedQty <= 0 || executedPrice <= 0) {
        log('[S-DATA] ⚠️ Ejecución Short inválida (Qty o Price en 0).', 'error');
        return;
    }

    // --- CONTINUAR CON CÁLCULOS USANDO VALORES REALES ---
    // En lugar de usar montos teóricos (6 USDT), usamos el valor real del exchange
    const currentSBalance = parseFloat(botState.sbalance || 0);
    
    // IMPORTANTE: Aquí restamos el valor REAL que Bitmart nos confirma (5.389...)
    const finalizedSBalance = parseFloat((currentSBalance - baseExecutedValue).toFixed(8));

    const currentAC = parseFloat(botState.sac || 0); 
    const currentAI = parseFloat(botState.sai || 0); 
    const currentOCC = parseInt(botState.socc || 0); 
    
    const isFirstOrder = currentOCC === 0;
    
    const newAC = parseFloat((currentAC + executedQty).toFixed(8)); 
    const newAI = currentAI + baseExecutedValue;
    const newPPC = newAI / newAC; 
    const newOCC = currentOCC + 1;

    
    // --- 2. LÓGICA EXPONENCIAL Y TARGETS ---
    // Usamos profit_percent (nuevo campo 2026) o trigger como fallback
    const profitTrigger = parseNumber(botState.config.short?.profit_percent || botState.config.short?.trigger || 0) / 100;
    const newSPC = newPPC * (1 - profitTrigger); // Target Price para la recompra (Take Profit)

    const { price_var, size_var, purchaseUsdt } = botState.config.short || {};
    
    // Siguiente precio de cobertura: El precio de ejecución actual + la variación porcentual
    const newNCP = executedPrice * (1 + (parseNumber(price_var) / 100)); 

    // Monto para la siguiente orden DCA (Exponencial)
    const nextRCA = getExponentialAmount(purchaseUsdt, newOCC, size_var);
    
    // --- 3. RECALCULAR RESISTENCIA (Coverage) ---
    const { coveragePrice, numberOfOrders } = calculateShortCoverage(
        finalizedSBalance, 
        executedPrice, 
        purchaseUsdt, 
        parseNumber(price_var) / 100, 
        parseNumber(size_var),
        newOCC
    );

    // --- 4. PERSISTENCIA ATÓMICA EN RAÍZ ---
    await saveExecutedOrder({ ...orderDetails, side: 'sell' }, SSTATE);

    await updateGeneralBotState({
        sac: newAC,
        sai: newAI,
        sppc: newPPC,
        socc: newOCC,        
        slep: executedPrice, // Último precio ejecutado
        sncp: newNCP,        // Siguiente precio de cobertura
        srca: nextRCA,       // Siguiente monto de cobertura
        spc: newSPC,         // Short Profit Check (Target Price)
        sbalance: finalizedSBalance,
        scoverage: coveragePrice, 
        snorder: numberOfOrders,   
        sstartTime: isFirstOrder ? new Date() : botState.sstartTime,
        slastOrder: null     // Limpiamos la orden para permitir el siguiente tick
    });
    
    log(`✅ [S-DATA] DCA #${newOCC} Confirmado. PPC: ${newPPC.toFixed(2)}. Sig. DCA: $${newNCP.toFixed(2)} (${nextRCA.toFixed(2)} USDT).`, 'success');
}

/**
 * Maneja el éxito de una COMPRA (Take Profit).
 * Cierra el ciclo, registra el beneficio y resetea indicadores.
 */
async function handleSuccessfulShortBuy(botStateObj, orderDetails, dependencies) {
    const { config, log, updateBotState, updateGeneralBotState, logSuccessfulCycle } = dependencies;
    
    try {
        const buyPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
        const filledSize = parseFloat(orderDetails.filledSize || 0); 
        
        // El Short es rentable si: (Lo que recibimos al vender > Lo que gastamos al recomprar)
        const totalUsdtReceivedFromSales = parseFloat(botStateObj.sai || 0); 
        const totalSpentToCover = (filledSize * buyPrice) * (1 + BUY_FEE_PERCENT);
        const profitNeto = totalUsdtReceivedFromSales - totalSpentToCover;

        // Recuperamos el balance: Balance actual + Inversión retornada + Profit Neto
        const finalizedSBalance = parseFloat(((parseFloat(botStateObj.sbalance) || 0) + totalUsdtReceivedFromSales + profitNeto).toFixed(8));

        await saveExecutedOrder({ ...orderDetails, side: 'buy' }, SSTATE);

        // --- REGISTRO DE CICLO EN HISTORIAL ---
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
                    finalSellPrice: buyPrice, // Precio de recompra
                    orderCount: parseInt(botStateObj.socc || 0),
                    initialInvestment: totalUsdtReceivedFromSales,
                    finalRecovery: totalSpentToCover,
                    netProfit: profitNeto,
                    profitPercentage: (profitNeto / totalUsdtReceivedFromSales) * 100
                });
            } catch (dbError) {
                log(`⚠️ Historial Short: Error al guardar, pero el ciclo continúa.`, 'error');
            }
        }

        const shouldStopShort = config.short?.stopAtCycle === true;

        // --- RESETEO TOTAL DE LA RAÍZ (Tabula Rasa) ---
        await updateGeneralBotState({
            sac: 0,
            sai: 0,
            sppc: 0,
            socc: 0,
            slep: 0,
            sncp: 0,
            srca: 0,
            spc: 0,
            sstartTime: null,
            scoverage: 0,
            snorder: 0,
            slastOrder: null, 
            sbalance: finalizedSBalance,
            total_profit: (parseFloat(botStateObj.total_profit) || 0) + profitNeto,
            scycle: (Number(botStateObj.scycle || 0) + 1),
            'config.short.enabled': !shouldStopShort
        });

        log(`💰 [S-DATA] Ciclo Short Cerrado. Profit: +${profitNeto.toFixed(2)} USDT. Balance: ${finalizedSBalance.toFixed(2)}`, 'success');
        
        // Transición de estado: Si stopAtCycle es true, va a STOPPED, si no, a RUNNING para empezar otro
        await updateBotState(shouldStopShort ? 'STOPPED' : 'RUNNING', SSTATE);

    } catch (error) {
        log(`❌ [S-DATA] Error crítico en cierre Short: ${error.message}`, 'error');
        throw error;
    }
}

module.exports = { handleSuccessfulShortSell, handleSuccessfulShortBuy };