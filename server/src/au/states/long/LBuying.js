const { placeFirstLongOrder, placeCoverageBuyOrder } = require('../../managers/longOrderManager'); 
const { monitorAndConsolidate } = require('./LongBuyConsolidator'); 

/**
 * ESTADO BUYING (LONG):
 * Monitorea el mercado para ejecutar compras iniciales o promediar (DCA) exponencialmente.
 */
async function run(dependencies) {
    const {
        botState, currentPrice, config, log,
        updateBotState, updateLStateData, updateGeneralBotState,
        availableUSDT 
    } = dependencies;

    const SYMBOL = String(config.symbol || 'BTC_USDT');
    const LSTATE = 'long';

    try {
        // 1. MONITOREO DE ORDEN PENDIENTE
        const orderIsActive = await monitorAndConsolidate(
            botState, SYMBOL, log, updateLStateData, updateBotState, updateGeneralBotState
        );
        
        if (orderIsActive) return; 
        
        // 2. LOG DE MONITOREO
        if (parseFloat(botState.lppc || 0) > 0) {
            const nextPrice = parseFloat(botState.lncp || 0);
            const targetTP = parseFloat(botState.ltprice || 0);
            
            const distToDCA = (nextPrice > 0) ? Math.abs(((currentPrice / nextPrice) - 1) * 100).toFixed(2) : "0.00";
            const distToTP = (targetTP > 0) ? Math.abs(((targetTP / currentPrice) - 1) * 100).toFixed(2) : "0.00";
            const pnlActual = botState.lprofit || 0;

            // Determinación de signos según posición relativa al precio actual
            const signDCA = nextPrice > currentPrice ? '+' : '-';
            const signTP = targetTP > currentPrice ? '+' : '-';

            log(`[L-BUYING] 👁️ BTC: ${currentPrice.toFixed(2)} | DCA: ${nextPrice.toFixed(2)} (${signDCA}${distToDCA}%) | TP Target: ${targetTP.toFixed(2)} (${signTP}${distToTP}%) | PNL: ${pnlActual.toFixed(2)} USDT`, 'info');
        } // <--- AQUÍ FALTABA ESTA LLAVE PARA CERRAR EL BLOQUE DE LOG

        // 3. LÓGICA DE APERTURA
        if (parseFloat(botState.lppc || 0) === 0 && !botState.llastOrder) {
            const purchaseAmount = parseFloat(config.long.purchaseUsdt);
            
            if (availableUSDT >= purchaseAmount && botState.lbalance >= purchaseAmount) {
                log("🚀 [L-BUY] Iniciando ciclo Long. Colocando primera compra exponencial...", 'info');
                await placeFirstLongOrder(config, botState, log, updateBotState, updateGeneralBotState); 
            } else {
                log(`⚠️ [L-BUY] Fondos insuficientes para apertura.`, 'warning');
                await updateBotState('PAUSED', LSTATE); 
            }
            return; 
        }

        // 4. EVALUACIÓN DE SALIDA HACIA SELLING (Con Limpieza de Trailing)
        if (botState.ltprice > 0 && currentPrice >= botState.ltprice) {
            log(`💰 [L-BUY] Target Profit (${botState.ltprice.toFixed(2)}) alcanzado. Activando Trailing Stop en SELLING...`, 'success');
            
            await updateGeneralBotState({
                lpm: 0,
                lpc: 0
            });

            await updateBotState('SELLING', LSTATE);
            return;
        }

        // 5. DISPARO DE DCA EXPONENCIAL
        const requiredAmount = parseFloat(botState.lrca || 0);
        const nextPriceThreshold = parseFloat(botState.lncp || 0);
        const lastExecutionPrice = parseFloat(botState.llep || 0); 
        
        const isPriceLowEnough = nextPriceThreshold > 0 && currentPrice <= nextPriceThreshold;

        if (!botState.llastOrder && isPriceLowEnough) {
            if (lastExecutionPrice > 0 && currentPrice >= lastExecutionPrice) {
                log(`[L-BUY] 🛑 Bloqueo de seguridad: El precio actual (${currentPrice.toFixed(2)}) no es inferior al de la última compra (${lastExecutionPrice.toFixed(2)}).`, 'warning');
                return; 
            }

            const hasFunds = (availableUSDT >= requiredAmount && botState.lbalance >= requiredAmount);

            if (hasFunds && requiredAmount > 0) {
                log(`📉 [L-BUY] Disparando DCA Exponencial: ${requiredAmount.toFixed(2)} USDT.`, 'warning');
                try {
                    await placeCoverageBuyOrder(botState, requiredAmount, log, updateGeneralBotState, updateBotState);
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