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
    const sStateData = botState.sStateData;
    const SSTATE = 'short';

    try {
        const orderIsActive = await monitorShortSell(
            botState, SYMBOL, log, updateSStateData, updateBotState, updateGeneralBotState
        );
        if (orderIsActive) return; 

        if (sStateData.ppc > 0) {
            const distToDCA = (((sStateData.nextCoveragePrice / currentPrice) - 1) * 100).toFixed(2);
            const distToTP = (((currentPrice / botState.stprice) - 1) * 100).toFixed(2);
            const pnlActual = botState.sprofit || 0;
            log(`[S-SELLING] 👁️ BTC: ${currentPrice.toFixed(2)} | DCA : ${sStateData.nextCoveragePrice.toFixed(2)} (+${distToDCA}%) | TP : ${botState.stprice.toFixed(2)} (-${distToTP}%) | PNL: ${pnlActual.toFixed(2)} USDT`, 'info');
        }  

        // 2. LÓGICA DE APERTURA - Inyectamos currentPrice
        if ((!sStateData.ppc || sStateData.ppc === 0) && !sStateData.lastOrder) {
            const purchaseAmount = parseFloat(config.short.purchaseUsdt || 0);
            const currentSBalance = parseFloat(botState.sbalance || 0);

            if (availableUSDT >= purchaseAmount && currentSBalance >= purchaseAmount) {
                log(`🚀 [S-SELL] Iniciando Ciclo Short: Venta inicial de ${purchaseAmount} USDT`, 'info');
                // PASAMOS currentPrice AQUÍ
                await placeFirstShortOrder(config, botState, log, updateBotState, updateGeneralBotState, currentPrice);
            } else {
                log(`⚠️ [S-SELL] Fondos insuficientes. Esperando...`, 'warning');
                await updateBotState('NO_COVERAGE', SSTATE);
            }
            return;
        }

        // 3. EVALUACIÓN DE SALIDA
        if (botState.stprice > 0 && currentPrice <= botState.stprice) {
            log(`💰 [S-SELL] TP Short alcanzado. Cerrando ciclo.`, 'success');
            await updateBotState('BUYING', SSTATE);
            return;
        }

        // 4. DCA EXPONENCIAL - Inyectamos currentPrice
        const requiredAmount = parseFloat(sStateData.requiredCoverageAmount || 0);

        if (!sStateData.lastOrder && sStateData.nextCoveragePrice > 0 && currentPrice >= sStateData.nextCoveragePrice) {
            const hasBalance = botState.sbalance >= requiredAmount && availableUSDT >= requiredAmount;

            if (hasBalance && requiredAmount > 0) {
                log(`📈 [S-SELL] Ejecutando DCA Exponencial: ${requiredAmount.toFixed(2)} USDT`, 'warning');
                try {
                    // PASAMOS currentPrice AQUÍ
                    await placeCoverageShortOrder(botState, requiredAmount, log, updateGeneralBotState, updateBotState, currentPrice);
                } catch (error) {
                    log(`❌ [S-SELL] Error en orden de cobertura: ${error.message}`, 'error');
                }
            } else {
                log(`🚫 [S-SELL] STOP por falta de fondos.`, 'error');
                await updateBotState('NO_COVERAGE', SSTATE);
            }
            return;
        }

    } catch (criticalError) {
        log(`🔥 [CRITICAL ERROR] SSelling: ${criticalError.message}`, 'error');
    }
}

module.exports = { run };