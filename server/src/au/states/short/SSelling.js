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
        // 1. MONITOREO DE ÓRDENES ACTIVAS
        const orderIsActive = await monitorShortSell(
            botState, SYMBOL, log, updateSStateData, updateBotState, updateGeneralBotState
        );
        if (orderIsActive) return; 

        // 2. LOG DE MONITOREO
        if (botState.sppc > 0) {
            const nextPrice = botState.sncp || 0; 
            const targetActivation = botState.stprice || 0; // 🎯 CAMBIO: Usamos stprice
            
            const distToDCA = nextPrice > 0 ? (((nextPrice / currentPrice) - 1) * 100).toFixed(2) : "0.00";
            const distToTP = targetActivation > 0 ? (((currentPrice / targetActivation) - 1) * 100).toFixed(2) : "0.00";
            const pnlActual = botState.sprofit || 0;
            
            log(`[S-SELLING] 👁️ BTC: ${currentPrice.toFixed(2)} | DCA: ${nextPrice.toFixed(2)} (+${distToDCA}%) | TP Target: ${targetActivation.toFixed(2)} (-${distToTP}%) | PNL: ${pnlActual.toFixed(2)} USDT`, 'info');
        }

        // 3. LÓGICA DE APERTURA
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
                await updateBotState('STOPPED', SSTATE);
            }
            return;
        }

        // 4. EVALUACIÓN DE ACTIVACIÓN (Hacia S-BUYING para Trailing Stop)
        const targetActivation = botState.stprice || 0; // 🎯 CAMBIO: Usamos stprice
        if (targetActivation > 0 && currentPrice <= targetActivation) {
            log(`💰 [S-SELL] Target (${targetActivation.toFixed(2)}) alcanzado. Iniciando Trailing Stop en BUYING...`, 'success');
            
            // 🧹 LIMPIEZA Y TRANSICIÓN
            // Al entrar a BUYING, spm se inicializará con el precio actual en el siguiente tick.
            await updateGeneralBotState({
                spm: 0, 
                spc: 0 
            });

            await updateBotState('BUYING', SSTATE);
            return;
        }

        // 5. DCA EXPONENCIAL (Protección ante subidas con Candado de Seguridad)
        const requiredAmount = parseFloat(botState.srca || 0); 
        const nextCoveragePrice = parseFloat(botState.sncp || 0); 
        const lastExecutionPrice = parseFloat(botState.slep || 0);

        const isPriceHighEnough = nextCoveragePrice > 0 && currentPrice >= nextCoveragePrice;

        if (!pendingOrder && isPriceHighEnough) {
            
            // 🛡️ CANDADO DE SEGURIDAD: Evita DCA en el mismo nivel o inferior
            if (currentPrice <= lastExecutionPrice) {
                log(`[S-SELL] 🛑 Bloqueo de seguridad: Precio actual (${currentPrice.toFixed(2)}) no es superior al anterior (${lastExecutionPrice.toFixed(2)}).`, 'warning');
                return; 
            }

            const hasBalance = botState.sbalance >= requiredAmount && availableUSDT >= requiredAmount;

            if (hasBalance && requiredAmount > 0) {
                log(`📈 [S-SELL] Precio superó DCA. Incrementando cobertura...`, 'warning');
                try {
                    await placeCoverageShortOrder(botState, requiredAmount, log, updateGeneralBotState, updateBotState, currentPrice);
                } catch (error) {
                    log(`❌ [S-SELL] Fallo al colocar cobertura: ${error.message}`, 'error');
                }
            } else {
                log(`🚫 [S-SELL] DCA fallido por balance insuficiente.`, 'error');
                await updateBotState('NO_COVERAGE', SSTATE);
            }
            return;
        }

    } catch (criticalError) {
        log(`🔥 [CRITICAL] SSelling: ${criticalError.message}`, 'error');
    }
}

module.exports = { run };