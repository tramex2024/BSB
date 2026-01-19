// BSB/server/src/au/states/long/LBuying.js

const { placeFirstLongOrder, placeCoverageBuyOrder } = require('../../managers/longOrderManager'); 
const { monitorAndConsolidate } = require('./LongBuyConsolidator'); 

/**
 * ESTADO BUYING: El corazón de la toma de decisiones.
 * Ejecuta la lógica exponencial y gestiona transiciones a SELLING o NO_COVERAGE.
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
        // =================================================================
        // 1. MONITOREO DE ORDEN PENDIENTE (Raíz: llastOrder)
        // =================================================================
        const orderIsActive = await monitorAndConsolidate(
            botState, SYMBOL, log, updateLStateData, updateBotState, updateGeneralBotState
        );
        
        if (orderIsActive) return; 
        
        // =================================================================
        // 2. LOG DE MONITOREO (LATIDO) - Referencias de Raíz
        // =================================================================
        // lppc: Long Price Per Coin | lncp: Long Next Coverage Price
        if (parseFloat(botState.lppc || 0) > 0) {
            const nextPrice = parseFloat(botState.lncp || 0);
            const distToDCA = nextPrice > 0 ? (((currentPrice / nextPrice) - 1) * 100).toFixed(2) : "0.00";
            const distToTP = (((botState.ltprice / currentPrice) - 1) * 100).toFixed(2);
            const pnlActual = botState.lprofit || 0;

            log(`[L-BUYING] 👁️ BTC: ${currentPrice.toFixed(2)} | DCA : ${nextPrice.toFixed(2)} (${distToDCA}%) | TP : ${botState.ltprice.toFixed(2)} (${distToTP}%) | PNL: ${pnlActual.toFixed(2)} USDT`, 'info');
        }
  
        // =================================================================
        // 3. LÓGICA DE PRIMERA COMPRA (Inicio de Ciclo)
        // =================================================================
        if (parseFloat(botState.lppc || 0) === 0 && !botState.llastOrder) {
            const purchaseAmount = parseFloat(config.long.purchaseUsdt);
            const currentLBalance = parseFloat(botState.lbalance || 0);

            if (availableUSDT >= purchaseAmount && currentLBalance >= purchaseAmount) {
                log("🚀 [L-BUY] Iniciando ciclo exponencial. Colocando primera compra...", 'info');
                await placeFirstLongOrder(config, botState, log, updateBotState, updateGeneralBotState); 
            } else {
                log(`⚠️ [L-BUY] Esperando fondos para iniciar (Necesita: ${purchaseAmount}). Estado: NO_COVERAGE`, 'warning');
                await updateBotState('NO_COVERAGE', LSTATE); 
            }
            return; 
        }

        // =================================================================
        // 4. EVALUACIÓN DE SALIDA (Take Profit)
        // =================================================================
        if (botState.ltprice > 0 && currentPrice >= botState.ltprice) {
            log(`💰 [L-BUY] Profit detectado (${currentPrice.toFixed(2)}). Pasando a SELLING.`, 'success');
            await updateBotState('SELLING', LSTATE);
            return;
        }

        // =================================================================
        // 5. DISPARO DE COBERTURA EXPONENCIAL (DCA) - Siglas lrca y lncp
        // =================================================================
        // lrca: Long Required Coverage Amount
        const requiredAmount = parseFloat(botState.lrca || 0);
        const nextCoveragePrice = parseFloat(botState.lncp || 0);
        
        if (!botState.llastOrder && nextCoveragePrice > 0 && currentPrice <= nextCoveragePrice) {
            
            const hasBalance = botState.lbalance >= requiredAmount && availableUSDT >= requiredAmount;

            if (hasBalance) {
                log(`📉 [L-BUY] Disparando DCA Exponencial (${requiredAmount.toFixed(2)} USDT) en precio ${currentPrice.toFixed(2)}`, 'warning');
                try {
                    await placeCoverageBuyOrder(botState, requiredAmount, log, updateGeneralBotState, updateBotState);
                } catch (error) {
                    log(`❌ [L-BUY] Error de red al promediar: ${error.message}. Reintentando...`, 'error');
                }
            } else {
                log(`🚫 [L-BUY] Cobertura requerida: ${requiredAmount.toFixed(2)} sin fondos suficientes. Pausando en NO_COVERAGE.`, 'error');
                await updateBotState('NO_COVERAGE', LSTATE);
            }
            return;
        }

    } catch (criticalError) {
        log(`🔥 [CRITICAL ERROR] LBuying: ${criticalError.message}. Manteniendo bot autónomo...`, 'error');
    }
}

module.exports = { run };