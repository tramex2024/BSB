// BSB/server/src/au/states/short/SSelling.js

const { placeFirstShortOrder, placeCoverageShortOrder } = require('../../managers/shortOrderManager');
const { monitorAndConsolidateShort: monitorShortSell } = require('./ShortSellConsolidator');

/**
 * ESTADO SELLING (SHORT): Maneja la apertura y el DCA exponencial hacia arriba.
 * Diseñado para la autonomía total sin caer en 'STOPPED'.
 */
async function run(dependencies) {
    const {
        botState, currentPrice, config, log,
        updateBotState, updateSStateData, updateGeneralBotState,
        availableUSDT // Balance real inyectado
    } = dependencies;

    const SYMBOL = String(config.symbol || 'BTC_USDT');
    const sStateData = botState.sStateData;
    const SSTATE = 'short';

    try {
        // =================================================================
        // 1. MONITOREO DE ORDEN PENDIENTE (Prioridad de Bloqueo)
        // =================================================================
        const orderIsActive = await monitorShortSell(
            botState, SYMBOL, log, updateSStateData, updateBotState, updateGeneralBotState
        );
        
        if (orderIsActive) return; 

        // =================================================================
        // 2. LÓGICA DE APERTURA (Si la posición Short está vacía)
        // =================================================================
        if (sStateData.ppc === 0 && !sStateData.lastOrder) {
            const purchaseAmount = parseFloat(config.short.purchaseUsdt);
            const currentSBalance = parseFloat(botState.sbalance || 0);

            if (availableUSDT >= purchaseAmount && currentSBalance >= purchaseAmount) {
                log("🚀 [S-SELL] Iniciando Ciclo Short: Colocando primera venta...", 'info');
                await placeFirstShortOrder(config, botState, log, updateBotState, updateGeneralBotState);
            } else {
                log(`⚠️ [S-SELL] Sin fondos para iniciar Short. Esperando en NO_COVERAGE.`, 'warning');
                await updateBotState('NO_COVERAGE', SSTATE);
            }
            return;
        }

        // =================================================================
        // 3. EVALUACIÓN DE SALIDA (Take Profit - Recompra Abajo)
        // =================================================================
        if (botState.stprice > 0 && currentPrice <= botState.stprice) {
            log(`💰 [S-SELL] TP Short alcanzado (${currentPrice.toFixed(2)}). Pasando a BUYING para cerrar.`, 'success');
            await updateBotState('BUYING', SSTATE);
            return;
        }

        // =================================================================
        // 4. DCA EXPONENCIAL HACIA ARRIBA (Vender más caro para subir PPC)
        // =================================================================
        const requiredAmount = sStateData.requiredCoverageAmount;

        if (!sStateData.lastOrder && sStateData.nextCoveragePrice > 0 && currentPrice >= sStateData.nextCoveragePrice) {
            
            const hasBalance = botState.sbalance >= requiredAmount && availableUSDT >= requiredAmount;

            if (hasBalance) {
                log(`📈 [S-SELL] Disparando DCA Short Exponencial (${requiredAmount.toFixed(2)} USDT) en ${currentPrice.toFixed(2)}`, 'warning');
                try {
                    // Esta función ejecuta la venta y actualiza los estados de orden
                    await placeCoverageShortOrder(botState, requiredAmount, log, updateGeneralBotState, updateBotState);
                } catch (error) {
                    log(`❌ [S-SELL] Error al colocar orden de cobertura: ${error.message}. Reintentando...`, 'error');
                }
            } else {
                log(`🚫 [S-SELL] Fondos insuficientes para cubrir subida. Pasando a NO_COVERAGE.`, 'error');
                await updateBotState('NO_COVERAGE', SSTATE);
            }
            return;
        }

    } catch (criticalError) {
        log(`🔥 [CRITICAL ERROR] SSelling: ${criticalError.message}. Manteniendo autonomía...`, 'error');
    }
}

module.exports = { run };