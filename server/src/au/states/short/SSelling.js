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
    // Acceso seguro a sStateData
    const sStateData = botState.sStateData || {};
    const SSTATE = 'short';

    try {
        // 1. MONITOREO DE ÓRDENES ACTIVAS
        const orderIsActive = await monitorShortSell(
            botState, SYMBOL, log, updateSStateData, updateBotState, updateGeneralBotState
        );
        if (orderIsActive) return; 

        // LOG DE SEGUIMIENTO (Solo si ya hay una posición abierta)
        if (sStateData.ppc > 0) {
            const nextPrice = sStateData.nextCoveragePrice || 0;
            const targetPrice = botState.stprice || 0;
            
            const distToDCA = nextPrice > 0 ? (((nextPrice / currentPrice) - 1) * 100).toFixed(2) : "0.00";
            const distToTP = targetPrice > 0 ? (((currentPrice / targetPrice) - 1) * 100).toFixed(2) : "0.00";
            const pnlActual = botState.sprofit || 0;
            
            log(`[S-SELLING] 👁️ BTC: ${currentPrice.toFixed(2)} | DCA : ${nextPrice.toFixed(2)} (+${distToDCA}%) | TP : ${targetPrice.toFixed(2)} (-${distToTP}%) | PNL: ${pnlActual.toFixed(2)} USDT`, 'info');
        }   

        // 2. LÓGICA DE APERTURA (Si no hay promedio PPC ni orden pendiente)
        if ((!sStateData.ppc || sStateData.ppc === 0) && !sStateData.lastOrder) {
            // Acceso jerárquico a la nueva configuración Short
            const purchaseAmount = parseFloat(config.short?.purchaseUsdt || 0);
            const currentSBalance = parseFloat(botState.sbalance || 0);

            if (availableUSDT >= purchaseAmount && currentSBalance >= purchaseAmount) {
                log(`🚀 [S-SELL] Iniciando Ciclo Short: Venta inicial de ${purchaseAmount} USDT`, 'info');
                // Se inyecta currentPrice según tu lógica actual
                await placeFirstShortOrder(config, botState, log, updateBotState, updateGeneralBotState, currentPrice);
            } else {
                log(`⚠️ [S-SELL] Fondos insuficientes para apertura Short.`, 'warning');
                await updateBotState('NO_COVERAGE', SSTATE);
            }
            return;
        }

        // 3. EVALUACIÓN DE SALIDA (Hacia Trailing Stop en BUYING)
        if (botState.stprice > 0 && currentPrice <= botState.stprice) {
            log(`💰 [S-SELL] TP Short alcanzado. Transicionando a BUYING para Trailing Stop.`, 'success');
            await updateBotState('BUYING', SSTATE);
            return;
        }

        // 4. DCA EXPONENCIAL
        const requiredAmount = parseFloat(sStateData.requiredCoverageAmount || 0);

        if (!sStateData.lastOrder && sStateData.nextCoveragePrice > 0 && currentPrice >= sStateData.nextCoveragePrice) {
            const hasBalance = botState.sbalance >= requiredAmount && availableUSDT >= requiredAmount;

            if (hasBalance && requiredAmount > 0) {
                log(`📈 [S-SELL] Ejecutando DCA Exponencial: ${requiredAmount.toFixed(2)} USDT`, 'warning');
                try {
                    await placeCoverageShortOrder(botState, requiredAmount, log, updateGeneralBotState, updateBotState, currentPrice);
                } catch (error) {
                    log(`❌ [S-SELL] Error en orden de cobertura: ${error.message}`, 'error');
                }
            } else {
                log(`🚫 [S-SELL] STOP DCA por falta de fondos.`, 'error');
                await updateBotState('NO_COVERAGE', SSTATE);
            }
            return;
        }

    } catch (criticalError) {
        log(`🔥 [CRITICAL ERROR] SSelling: ${criticalError.message}`, 'error');
    }
}

module.exports = { run };