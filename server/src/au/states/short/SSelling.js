// BSB/server/src/au/states/short/SSelling.js

const { placeFirstShortOrder, placeCoverageShortOrder } = require('../../managers/shortOrderManager');
const { monitorAndConsolidateShort: monitorShortSell } = require('./ShortSellConsolidator');

/**
 * ESTADO SELLING (SHORT): Maneja la apertura y el DCA exponencial hacia arriba.
 * Unificado para trabajar con montos en USDT.
 */
async function run(dependencies) {
    const {
        botState, currentPrice, config, log,
        updateBotState, updateSStateData, updateGeneralBotState,
        availableUSDT // Balance real inyectado desde BitMart
    } = dependencies;

    const SYMBOL = String(config.symbol || 'BTC_USDT');
    const sStateData = botState.sStateData;
    const SSTATE = 'short';

    try {
        // 1. MONITOREO DE ORDEN PENDIENTE
        const orderIsActive = await monitorShortSell(
            botState, SYMBOL, log, updateSStateData, updateBotState, updateGeneralBotState
        );
        if (orderIsActive) return; 

        // =================================================================
        // NUEVO: LOG DE MONITOREO (LATIDO DE SHORT SELLING)
        // =================================================================
        if (sStateData.ppc > 0) {
            // Distancia al DCA (Arriba): ¿Cuánto falta para vender más caro?
            const distToDCA = (((sStateData.nextCoveragePrice / currentPrice) - 1) * 100).toFixed(2);
            // Distancia al TP (Abajo): ¿Cuánto falta para recomprar con ganancia?
            const distToTP = (((currentPrice / botState.stprice) - 1) * 100).toFixed(2);
            const pnlActual = botState.sprofit || 0;

            log(`[S-SELLING] 👁️ BTC: ${currentPrice.toFixed(2)} | DCA @: ${sStateData.nextCoveragePrice.toFixed(2)} (+${distToDCA}%) | TP @: ${botState.stprice.toFixed(2)} (-${distToTP}%) | PNL: ${pnlActual.toFixed(2)} USDT`, 'info');
        }  

        // 2. LÓGICA DE APERTURA (Si la posición Short está vacía)
        if ((!sStateData.ppc || sStateData.ppc === 0) && !sStateData.lastOrder) {
            // 🟢 Usamos purchaseUsdt del nuevo modelo
            const purchaseAmount = parseFloat(config.short.purchaseUsdt || 0);
            const currentSBalance = parseFloat(botState.sbalance || 0);

            if (availableUSDT >= purchaseAmount && currentSBalance >= purchaseAmount) {
                log(`🚀 [S-SELL] Iniciando Ciclo Short: Venta inicial de ${purchaseAmount} USDT`, 'info');
                await placeFirstShortOrder(config, botState, log, updateBotState, updateGeneralBotState);
            } else {
                log(`⚠️ [S-SELL] Fondos insuficientes (Disp: ${availableUSDT}, Asig: ${currentSBalance}). Esperando...`, 'warning');
                await updateBotState('NO_COVERAGE', SSTATE);
            }
            return;
        }

        // 3. EVALUACIÓN DE SALIDA (Take Profit - Recompra Abajo)
        // En Short, salimos cuando el precio CAE por debajo de stprice
        if (botState.stprice > 0 && currentPrice <= botState.stprice) {
            log(`💰 [S-SELL] TP Short alcanzado (${currentPrice.toFixed(2)} <= ${botState.stprice.toFixed(2)}). Cerrando ciclo.`, 'success');
            await updateBotState('BUYING', SSTATE);
            return;
        }

        // 4. DCA EXPONENCIAL HACIA ARRIBA (Vender más caro para subir el PPC)
        const requiredAmount = parseFloat(sStateData.requiredCoverageAmount || 0);

        if (!sStateData.lastOrder && sStateData.nextCoveragePrice > 0 && currentPrice >= sStateData.nextCoveragePrice) {
            
            // Verificamos si tenemos el USDT necesario (en el balance real y en el asignado al bot)
            const hasBalance = botState.sbalance >= requiredAmount && availableUSDT >= requiredAmount;

            if (hasBalance && requiredAmount > 0) {
                log(`📈 [S-SELL] Precio en zona de cobertura (${currentPrice.toFixed(2)}). Ejecutando DCA Exponencial: ${requiredAmount.toFixed(2)} USDT`, 'warning');
                try {
                    // Esta función debe calcular la siguiente cantidad exponencial y guardarla en requiredCoverageAmount
                    await placeCoverageShortOrder(botState, requiredAmount, log, updateGeneralBotState, updateBotState);
                } catch (error) {
                    log(`❌ [S-SELL] Error en orden de cobertura: ${error.message}`, 'error');
                }
            } else {
                log(`🚫 [S-SELL] STOP por falta de fondos. Requerido: ${requiredAmount.toFixed(2)} USDT.`, 'error');
                await updateBotState('NO_COVERAGE', SSTATE);
            }
            return;
        }

    } catch (criticalError) {
        log(`🔥 [CRITICAL ERROR] SSelling: ${criticalError.message}`, 'error');
    }
}

module.exports = { run };