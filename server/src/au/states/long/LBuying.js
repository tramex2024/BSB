// BSB/server/src/au/states/long/LBuying.js

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
        // Verifica si una compra previa se completó para actualizar lppc y lac.
        const orderIsActive = await monitorAndConsolidate(
            botState, SYMBOL, log, updateLStateData, updateBotState, updateGeneralBotState
        );
        
        if (orderIsActive) return; 
        
        // 2. LOG DE MONITOREO (DASHBOARD BEAT)
        if (parseFloat(botState.lppc || 0) > 0) {
            const nextPrice = parseFloat(botState.lncp || 0);
            const targetTP = parseFloat(botState.ltprice || 0);
            
            // Distancia porcentual al DCA y al Profit
            const distToDCA = (nextPrice > 0) ? (((currentPrice / nextPrice) - 1) * 100).toFixed(2) : "0.00";
            const distToTP = (targetTP > 0) ? (((targetTP / currentPrice) - 1) * 100).toFixed(2) : "0.00";
            const pnlActual = botState.lprofit || 0;

            log(`[L-BUYING] 👁️ BTC: ${currentPrice.toFixed(2)} | DCA: ${nextPrice.toFixed(2)} (${distToDCA}%) | TP: ${targetTP.toFixed(2)} (${distToTP}%) | PNL: ${pnlActual.toFixed(2)} USDT`, 'info');
        }
  
        // 3. LÓGICA DE APERTURA (Si no hay posición activa)
        if (parseFloat(botState.lppc || 0) === 0 && !botState.llastOrder) {
            const purchaseAmount = parseFloat(config.long.purchaseUsdt);
            
            // Verificamos solvencia en el bot y en el saldo real de Bitmart
            if (availableUSDT >= purchaseAmount && botState.lbalance >= purchaseAmount) {
                log("🚀 [L-BUY] Iniciando ciclo Long. Colocando primera compra exponencial...", 'info');
                await placeFirstLongOrder(config, botState, log, updateBotState, updateGeneralBotState); 
            } else {
                log(`⚠️ [L-BUY] Fondos insuficientes para apertura. Necesita: ${purchaseAmount} USDT. Saldo real: ${availableUSDT}.`, 'warning');
                await updateBotState('NO_COVERAGE', LSTATE); 
            }
            return; 
        }

        // 4. EVALUACIÓN DE SALIDA HACIA SELLING
        // Si el precio cruza el target, pasamos al estado SELLING donde LSelling.js aplicará el Trailing Stop.
        if (botState.ltprice > 0 && currentPrice >= botState.ltprice) {
            log(`💰 [L-BUY] Target Profit tocado (${currentPrice.toFixed(2)}). Activando Trailing Stop en SELLING...`, 'success');
            await updateBotState('SELLING', LSTATE);
            return;
        }

        // 5. DISPARO DE DCA EXPONENCIAL
        // lrca: Long Required Coverage Amount | lncp: Long Next Coverage Price
        const requiredAmount = parseFloat(botState.lrca || 0);
        const nextPriceThreshold = parseFloat(botState.lncp || 0);
        
        if (!botState.llastOrder && nextPriceThreshold > 0 && currentPrice <= nextPriceThreshold) {
            
            const hasFunds = (availableUSDT >= requiredAmount && botState.lbalance >= requiredAmount);

            if (hasFunds) {
                log(`📉 [L-BUY] Disparando DCA Exponencial: ${requiredAmount.toFixed(2)} USDT. Precio: ${currentPrice.toFixed(2)}`, 'warning');
                try {
                    // El manager coloca la orden y la registra en llastOrder de la raíz
                    await placeCoverageBuyOrder(botState, requiredAmount, log, updateGeneralBotState, updateBotState);
                } catch (error) {
                    log(`❌ [L-BUY] Error en ejecución de DCA: ${error.message}`, 'error');
                }
            } else {
                log(`🚫 [L-BUY] Saldo insuficiente para mantener la progresión exponencial (${requiredAmount.toFixed(2)} USDT necesarios).`, 'error');
                await updateBotState('NO_COVERAGE', LSTATE);
            }
            return;
        }

    } catch (criticalError) {
        log(`🔥 [CRITICAL] LBuying: ${criticalError.message}`, 'error');
    }
}

module.exports = { run };