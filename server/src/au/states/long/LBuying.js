// BSB/server/src/au/states/long/LBuying.js

const { placeFirstLongOrder, placeCoverageBuyOrder } = require('../../managers/longOrderManager'); 
const { monitorAndConsolidate } = require('./LongBuyConsolidator'); 

/**
 * BUYING STATE (LONG):
 * Monitorea el mercado para ejecutar compras iniciales o promediado exponencial (DCA).
 */
async function run(dependencies) {
    const {
        userId,
        botState, 
        currentPrice, 
        config, 
        log,
        updateBotState, 
        updateLStateData, 
        updateGeneralBotState,
        availableUSDT,
        // --- INYECCIÓN DE LA FUNCIÓN FIRMADA ---
        placeLongOrder 
    } = dependencies;

    const SYMBOL = String(config.symbol || 'BTC_USDT');
    const LSTATE = 'long';

    try {
        // 1. MONITOREO DE ÓRDENES PENDIENTES
        const orderIsActive = await monitorAndConsolidate(
            botState, SYMBOL, log, updateLStateData, updateBotState, updateGeneralBotState, userId
        );
        
        if (orderIsActive) return; 
        
        // 2. LOG DE SEGUIMIENTO
        if (parseFloat(botState.lppc || 0) > 0) {
            const nextPrice = parseFloat(botState.lncp || 0);
            const targetTP = parseFloat(botState.ltprice || 0);
            
            const distToDCA = (nextPrice > 0) ? Math.abs(((currentPrice / nextPrice) - 1) * 100).toFixed(2) : "0.00";
            const distToTP = (targetTP > 0) ? Math.abs(((targetTP / currentPrice) - 1) * 100).toFixed(2) : "0.00";
            const pnlActual = botState.lprofit || 0;

            const signDCA = nextPrice > currentPrice ? '+' : '-';
            const signTP = targetTP > currentPrice ? '+' : '-';

            log(`[L-BUYING] 👁️ BTC: ${currentPrice.toFixed(2)} | DCA: ${nextPrice.toFixed(2)} (${signDCA}${distToDCA}%) | TP Target: ${targetTP.toFixed(2)} (${signTP}${distToTP}%) | PNL: ${pnlActual.toFixed(2)} USDT`, 'info');
        } 

        // 3. LÓGICA DE APERTURA (Ciclo nuevo)
        if (parseFloat(botState.lppc || 0) === 0 && !botState.llastOrder) {
            const purchaseAmount = parseFloat(config.long.purchaseUsdt);
            
            if (availableUSDT >= purchaseAmount && botState.lbalance >= purchaseAmount) {
                log("🚀 [L-BUY] Iniciando ciclo Long. Ejecutando primera orden firmada...", 'info');
                
                // --- CAMBIO: Pasamos placeLongOrder en lugar de userId ---
                await placeFirstLongOrder(config, botState, log, updateBotState, updateGeneralBotState, placeLongOrder); 
            } else {
                log(`⚠️ [L-BUY] Fondos insuficientes para apertura.`, 'warning');
                await updateBotState('PAUSED', LSTATE); 
            }
            return; 
        }

        // 4. TRANSICIÓN A VENTA (Target Profit alcanzado)
        if (botState.ltprice > 0 && currentPrice >= botState.ltprice) {
            log(`💰 [L-BUY] Target Profit alcanzado. Pasando a SELLING (Trailing)...`, 'success');
            await updateGeneralBotState({ lpm: 0, lpc: 0 });
            await updateBotState('SELLING', LSTATE);
            return;
        }

        // 5. DISPARADOR DE DCA EXPONENCIAL
        const requiredAmount = parseFloat(botState.lrca || 0);
        const nextPriceThreshold = parseFloat(botState.lncp || 0);
        const lastExecutionPrice = parseFloat(botState.llep || 0); 
        
        const isPriceLowEnough = nextPriceThreshold > 0 && currentPrice <= nextPriceThreshold;

        if (!botState.llastOrder && isPriceLowEnough) {
            if (lastExecutionPrice > 0 && currentPrice >= lastExecutionPrice) {
                log(`[L-BUY] 🛑 Bloqueo de seguridad: El precio no es menor a la última compra.`, 'warning');
                return; 
            }

            const hasFunds = (availableUSDT >= requiredAmount && botState.lbalance >= requiredAmount);

            if (hasFunds && requiredAmount > 0) {
                log(`📉 [L-BUY] Disparando DCA Exponencial: ${requiredAmount.toFixed(2)} USDT.`, 'warning');
                try {
                    // --- CAMBIO: Pasamos placeLongOrder en lugar de userId ---
                    await placeCoverageBuyOrder(botState, requiredAmount, log, updateGeneralBotState, updateBotState, placeLongOrder);
                } catch (error) {
                    log(`❌ [L-BUY] Error en ejecución de DCA: ${error.message}`, 'error');
                }
            } else {
                log(`🚫 [L-BUY] Saldo insuficiente para DCA exponencial.`, 'error');
                await updateBotState('PAUSED', LSTATE);
            }
            return;
        }

    } catch (criticalError) {
        log(`🔥 [CRITICAL] LBuying: ${criticalError.message}`, 'error');
    }
}

module.exports = { run };