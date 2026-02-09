// BSB/server/src/au/states/long/LBuying.js

const { placeFirstLongOrder, placeCoverageBuyOrder } = require('../../managers/longOrderManager'); 
const { monitorAndConsolidate } = require('./LongBuyConsolidator'); 

/**
 * BUYING STATE (LONG):
 * Monitorea el mercado para ejecutar compras iniciales o promediado exponencial (DCA).
 */
async function run(dependencies) {
    const {
        userId, // ID puro inyectado (ej: 698808...)
        botState, 
        currentPrice, 
        config, 
        log,
        updateBotState, 
        updateLStateData, 
        updateGeneralBotState,
        availableUSDT 
    } = dependencies;

    const SYMBOL = String(config.symbol || 'BTC_USDT');
    const LSTATE = 'long';

    try {
        // 1. MONITOREO DE ÓRDENES PENDIENTES
        // Se pasa el userId para que el monitor consulte solo las órdenes de este usuario
        const orderIsActive = await monitorAndConsolidate(
            botState, SYMBOL, log, updateLStateData, updateBotState, updateGeneralBotState, userId
        );
        
        if (orderIsActive) return; 
        
        // 2. LOG DE SEGUIMIENTO (Aislamiento de logs verificado)
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
                log("🚀 [L-BUY] Starting Long cycle. Placing first exponential buy...", 'info');
                // IMPORTANTE: El manager ahora recibe el userId para firmar la orden correctamente
                await placeFirstLongOrder(config, botState, log, updateBotState, updateGeneralBotState, userId); 
            } else {
                log(`⚠️ [L-BUY] Insufficient funds for opening.`, 'warning');
                await updateBotState('PAUSED', LSTATE); 
            }
            return; 
        }

        // 4. TRANSICIÓN A VENTA (Target Profit alcanzado)
        if (botState.ltprice > 0 && currentPrice >= botState.ltprice) {
            log(`💰 [L-BUY] Target Profit (${botState.ltprice.toFixed(2)}) reached. Activating Trailing Stop...`, 'success');
            
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
            // Protección contra doble compra en el mismo precio
            if (lastExecutionPrice > 0 && currentPrice >= lastExecutionPrice) {
                log(`[L-BUY] 🛑 Security Lock: Price not lower than last purchase.`, 'warning');
                return; 
            }

            const hasFunds = (availableUSDT >= requiredAmount && botState.lbalance >= requiredAmount);

            if (hasFunds && requiredAmount > 0) {
                log(`📉 [L-BUY] Triggering Exponential DCA: ${requiredAmount.toFixed(2)} USDT.`, 'warning');
                try {
                    await placeCoverageBuyOrder(botState, requiredAmount, log, updateGeneralBotState, updateBotState, userId);
                } catch (error) {
                    log(`❌ [L-BUY] DCA Execution Error: ${error.message}`, 'error');
                }
            } else {
                log(`🚫 [L-BUY] Insufficient balance for exponential DCA.`, 'error');
                await updateBotState('PAUSED', LSTATE);
            }
            return;
        }

    } catch (criticalError) {
        log(`🔥 [CRITICAL] LBuying: ${criticalError.message}`, 'error');
    }
}

module.exports = { run };