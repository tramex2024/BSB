// BSB/server/src/au/states/short/SSelling.js

const { placeFirstShortOrder, placeCoverageShortOrder } = require('../../managers/shortOrderManager');
const { monitorAndConsolidateShort: monitorShortSell } = require('./ShortSellConsolidator');

async function run(dependencies) {
    const {
        botState, currentPrice, config, log,
        updateBotState, updateSStateData, updateGeneralBotState,
        availableUSDT
    } = dependencies;

    const SYMBOL = String(config.symbol || 'BTC_USDT');
    const SSTATE = 'short';

    try {
        // 1. MONITOREO DE ÓRDENES ACTIVAS (Ventas o DCAs en proceso)
        const orderIsActive = await monitorShortSell(
            botState, SYMBOL, log, updateSStateData, updateBotState, updateGeneralBotState
        );
        if (orderIsActive) return; 

        // 2. LOG DE MONITOREO (Visualización en Dashboard)
        if (botState.sppc > 0) {
            const nextPrice = botState.sncp || 0; 
            const targetPrice = botState.spc || 0; 
            
            // Distancia al siguiente DCA (arriba) y al Take Profit (abajo)
            const distToDCA = nextPrice > 0 ? (((nextPrice / currentPrice) - 1) * 100).toFixed(2) : "0.00";
            const distToTP = targetPrice > 0 ? (((currentPrice / targetPrice) - 1) * 100).toFixed(2) : "0.00";
            const pnlActual = botState.sprofit || 0;
            
            log(`[S-SELLING] 👁️ BTC: ${currentPrice.toFixed(2)} | DCA: ${nextPrice.toFixed(2)} (+${distToDCA}%) | TP: ${targetPrice.toFixed(2)} (-${distToTP}%) | PNL: ${pnlActual.toFixed(2)} USDT`, 'info');
        }   

        // 3. LÓGICA DE APERTURA (Si no hay posición activa)
        const currentPPC = parseFloat(botState.sppc || 0);
        const pendingOrder = botState.slastOrder; 

        if ((!currentPPC || currentPPC === 0) && !pendingOrder) {
            const purchaseAmount = parseFloat(config.short?.purchaseUsdt || 0);
            const currentSBalance = parseFloat(botState.sbalance || 0);

            if (availableUSDT >= purchaseAmount && currentSBalance >= purchaseAmount) {
                log(`🚀 [S-SELL] Apertura Short de ${purchaseAmount} USDT.`, 'info');
                await placeFirstShortOrder(config, botState, log, updateBotState, updateGeneralBotState, currentPrice);
            } else {
                log(`⚠️ [S-SELL] Fondos insuficientes para abrir Short.`, 'warning');
                await updateBotState('NO_COVERAGE', SSTATE);
            }
            return;
        }

        // 4. EVALUACIÓN DE SALIDA (Take Profit / Trailing Stop)
        const targetPrice = botState.spc || 0;
        if (targetPrice > 0 && currentPrice <= targetPrice) {
            log(`💰 [S-SELL] Target Short alcanzado. Entrando a modo RECOMPRA (BUYING).`, 'success');
            // Transicionamos a BUYING donde vive el Trailing Stop de Short
            await updateBotState('BUYING', SSTATE);
            return;
        }

        // 5. DCA EXPONENCIAL (Protección ante subidas)
        const requiredAmount = parseFloat(botState.srca || 0); 
        const nextCoveragePrice = parseFloat(botState.sncp || 0); 

        if (!pendingOrder && nextCoveragePrice > 0 && currentPrice >= nextCoveragePrice) {
            const hasBalance = botState.sbalance >= requiredAmount && availableUSDT >= requiredAmount;

            if (hasBalance && requiredAmount > 0) {
                log(`📈 [S-SELL] Precio superó DCA Exponencial. Incrementando cobertura...`, 'warning');
                try {
                    // Esta función registra el slastOrder en la raíz automáticamente
                    await placeCoverageShortOrder(botState, requiredAmount, log, updateGeneralBotState, updateBotState, currentPrice);
                } catch (error) {
                    log(`❌ [S-SELL] Fallo al colocar cobertura: ${error.message}`, 'error');
                }
            } else {
                log(`🚫 [S-SELL] DCA fallido por balance insuficiente. Pasando a NO_COVERAGE.`, 'error');
                await updateBotState('NO_COVERAGE', SSTATE);
            }
            return;
        }

    } catch (criticalError) {
        log(`🔥 [CRITICAL] SSelling: ${criticalError.message}`, 'error');
    }
}

module.exports = { run };