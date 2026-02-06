// BSB/server/src/au/states/long/LBuying.js

const { placeFirstLongOrder, placeCoverageBuyOrder } = require('../../managers/longOrderManager'); 
const { monitorAndConsolidate } = require('./LongBuyConsolidator'); 

/**
 * ESTADO BUYING: El corazón de la toma de decisiones.
 * Diseñado para ser autónomo y evitar el estado 'STOPPED'.
 */
async function run(dependencies) {
    const {
        botState, currentPrice, config, log,
        updateBotState, updateLStateData, updateGeneralBotState,
        availableUSDT 
    } = dependencies;

    const SYMBOL = String(config.symbol || 'BTC_USDT');
    const lStateData = botState.lStateData;
    const LSTATE = 'long';

    try {
        // =================================================================
        // 1. MONITOREO DE ORDEN PENDIENTE (Bloqueo de seguridad)
        // =================================================================
        // monitorAndConsolidate se encarga de verificar si la orden anterior se llenó.
        const orderIsActive = await monitorAndConsolidate(
            botState, SYMBOL, log, updateLStateData, updateBotState, updateGeneralBotState
        );
        
        if (orderIsActive) return; 
        
        // =================================================================
        // NUEVO: LOG DE MONITOREO EN TIEMPO REAL (LATIDO)
        // =================================================================
        if (lStateData.ppc > 0) {
            const distToDCA = (((currentPrice / lStateData.nextCoveragePrice) - 1) * 100).toFixed(2);
            const distToTP = (((botState.ltprice / currentPrice) - 1) * 100).toFixed(2);
            const pnlActual = botState.lprofit || 0;

            // Este log aparecerá en tu consola y en el Dashboard
            log(`[L-BUYING] 👁️ BTC: ${currentPrice.toFixed(2)} | DCA : ${lStateData.nextCoveragePrice.toFixed(2)} (${distToDCA}%) | TP : ${botState.ltprice.toFixed(2)} (${distToTP}%) | PNL: ${pnlActual.toFixed(2)} USDT`, 'info');
        }
  
        // =================================================================
        // 2. LÓGICA DE PRIMERA COMPRA (Inicio de Ciclo)
        // =================================================================
        if (lStateData.ppc === 0 && !lStateData.lastOrder) {
            const purchaseAmount = parseFloat(config.long.purchaseUsdt);
            const currentLBalance = parseFloat(botState.lbalance || 0);

            // Verificamos si podemos iniciar
            if (availableUSDT >= purchaseAmount && currentLBalance >= purchaseAmount) {
                log("🚀 [L-BUY] Iniciando ciclo exponencial. Colocando primera compra...", 'info');
                await placeFirstLongOrder(config, botState, log, updateBotState, updateGeneralBotState); 
            } else {
                // En lugar de morir, pasamos a NO_COVERAGE para reintentar cuando haya fondos
                log(`⚠️ [L-BUY] Esperando fondos para iniciar (Necesita: ${purchaseAmount}). Estado: NO_COVERAGE`, 'warning');
                await updateBotState('NO_COVERAGE', LSTATE); 
            }
            return; 
        }

        // =================================================================
        // 3. EVALUACIÓN DE SALIDA (Take Profit)
        // =================================================================
        if (botState.ltprice > 0 && currentPrice >= botState.ltprice) {
            log(`💰 [L-BUY] Profit detectado (${currentPrice.toFixed(2)}). Pasando a SELLING.`, 'success');
            await updateBotState('SELLING', LSTATE);
            return;
        }

        // =================================================================
        // 4. DISPARO DE COBERTURA EXPONENCIAL (DCA)
        // =================================================================
        const requiredAmount = lStateData.requiredCoverageAmount;
        
        if (!lStateData.lastOrder && lStateData.nextCoveragePrice > 0 && currentPrice <= lStateData.nextCoveragePrice) {
            
            const hasBalance = botState.lbalance >= requiredAmount && availableUSDT >= requiredAmount;

            if (hasBalance) {
                log(`📉 [L-BUY] Disparando DCA Exponencial (${requiredAmount.toFixed(2)} USDT) en precio ${currentPrice.toFixed(2)}`, 'warning');
                try {
                    await placeCoverageBuyOrder(botState, requiredAmount, log, updateGeneralBotState, updateBotState);
                } catch (error) {
                    // Si falla la API, no cambiamos de estado, dejamos que el próximo tick reintente
                    log(`❌ [L-BUY] Error de red al promediar: ${error.message}. Reintentando en sig. tick.`, 'error');
                }
            } else {
                // Si el precio cayó pero no hay dinero para la siguiente orden exponencial,
                // entramos en modo espera activa (NO_COVERAGE)
                log(`🚫 [L-BUY] Cobertura requerida: ${requiredAmount.toFixed(2)} pero no hay fondos. Pausando en NO_COVERAGE.`, 'error');
                await updateBotState('NO_COVERAGE', LSTATE);
            }
            return;
        }

    } catch (criticalError) {
        // CAPA DE PROTECCIÓN FINAL: 
        // Si algo explota en la lógica, el bot registra el error pero se mantiene en BUYING
        // para que el loop principal lo vuelva a intentar. NUNCA va a STOPPED.
        log(`🔥 [CRITICAL ERROR] LBuying: ${criticalError.message}. Manteniendo bot autónomo...`, 'error');
    }
}

module.exports = { run };