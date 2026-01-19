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
        // Pasamos slastOrder explícitamente si el consolidador lo requiere, 
        // aunque el consolidador lo leerá de botState.slastOrder
        const orderIsActive = await monitorShortSell(
            botState, SYMBOL, log, updateSStateData, updateBotState, updateGeneralBotState
        );
        if (orderIsActive) return; 

        // ✅ MIGRADO: Lectura de raíz para el log de monitoreo
        if (botState.sppc > 0) {
            const nextPrice = botState.sncp || 0; // nextCoveragePrice -> sncp
            const targetPrice = botState.spc || 0; // Precio de corte -> spc
            
            const distToDCA = nextPrice > 0 ? (((nextPrice / currentPrice) - 1) * 100).toFixed(2) : "0.00";
            const distToTP = targetPrice > 0 ? (((currentPrice / targetPrice) - 1) * 100).toFixed(2) : "0.00";
            const pnlActual = botState.sprofit || 0;
            
            log(`[S-SELLING] 👁️ BTC: ${currentPrice.toFixed(2)} | DCA : ${nextPrice.toFixed(2)} (+${distToDCA}%) | TP : ${targetPrice.toFixed(2)} (-${distToTP}%) | PNL: ${pnlActual.toFixed(2)} USDT`, 'info');
        }   

        // 2. LÓGICA DE APERTURA (Usando sppc y slastOrder de raíz)
        const currentPPC = parseFloat(botState.sppc || 0);
        const pendingOrder = botState.slastOrder; // Identificador único para el Short

        if ((!currentPPC || currentPPC === 0) && !pendingOrder) {
            const purchaseAmount = parseFloat(config.short?.purchaseUsdt || 0);
            const currentSBalance = parseFloat(botState.sbalance || 0);

            if (availableUSDT >= purchaseAmount && currentSBalance >= purchaseAmount) {
                log(`🚀 [S-SELL] Iniciando Ciclo Short: Venta inicial de ${purchaseAmount} USDT`, 'info');
                await placeFirstShortOrder(config, botState, log, updateBotState, updateGeneralBotState, currentPrice);
            } else {
                log(`⚠️ [S-SELL] Fondos insuficientes para apertura Short.`, 'warning');
                await updateBotState('NO_COVERAGE', SSTATE);
            }
            return;
        }

        // 3. EVALUACIÓN DE SALIDA (Uso de spc de raíz)
        const targetPrice = botState.spc || 0;
        if (targetPrice > 0 && currentPrice <= targetPrice) {
            log(`💰 [S-SELL] TP Short alcanzado ($${targetPrice.toFixed(2)}). Transicionando a BUYING para Trailing Stop.`, 'success');
            await updateBotState('BUYING', SSTATE);
            return;
        }

        // 4. DCA EXPONENCIAL (Uso de srca y sncp de raíz)
        const requiredAmount = parseFloat(botState.srca || 0); 
        const nextCoveragePrice = parseFloat(botState.sncp || 0); 

        if (!pendingOrder && nextCoveragePrice > 0 && currentPrice >= nextCoveragePrice) {
            const hasBalance = botState.sbalance >= requiredAmount && availableUSDT >= requiredAmount;

            if (hasBalance && requiredAmount > 0) {
                log(`📈 [S-SELL] Ejecutando DCA Exponencial: ${requiredAmount.toFixed(2)} USDT`, 'warning');
                try {
                    // Esta función generará el nuevo slastOrder en la raíz al ejecutarse
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