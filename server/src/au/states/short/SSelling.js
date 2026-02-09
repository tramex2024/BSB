//BSB/server/src/au/states/short/SSelling.js

const { placeFirstShortOrder, placeCoverageShortOrder } = require('../../managers/shortOrderManager');
const { monitorAndConsolidateShort: monitorShortSell } = require('./ShortSellConsolidator');

/**
 * SELLING STATE (SHORT):
 * Gestiona la apertura de cortos y las coberturas exponenciales (DCA hacia arriba).
 */
async function run(dependencies) {
    const {
        userId, 
        botState, currentPrice, config, log,
        updateBotState, updateSStateData, updateGeneralBotState,
        availableUSDT
    } = dependencies;

    const SYMBOL = String(config.symbol || 'BTC_USDT');
    const SSTATE = 'short';

    try {
        // 1. MONITOR DE ÓRDENES ACTIVAS
        // Verificamos si hay una venta pendiente de confirmar en BitMart para este usuario
        const orderIsActive = await monitorShortSell(
            botState, SYMBOL, log, updateSStateData, updateBotState, updateGeneralBotState, userId
        );
        if (orderIsActive) return; 

        // 2. MONITORING LOG (Dashboard del usuario)
        if (botState.sppc > 0) {
            const nextPrice = botState.sncp || 0; 
            const targetActivation = botState.stprice || 0; 
            
            // En Short, DCA está arriba (+) y TP está abajo (-)
            const distToDCA = nextPrice > 0 ? ((nextPrice / currentPrice - 1) * 100).toFixed(2) : "0.00";
            const distToTP = targetActivation > 0 ? ((1 - currentPrice / targetActivation) * 100).toFixed(2) : "0.00";
            const pnlActual = botState.sprofit || 0;
            
            log(`[S-SELLING] 👁️ BTC: ${currentPrice.toFixed(2)} | DCA en: ${nextPrice.toFixed(2)} (+${distToDCA}%) | TP Target: ${targetActivation.toFixed(2)} (-${distToTP}%) | PNL: ${pnlActual.toFixed(2)} USDT`, 'info');
        }

        // 3. LÓGICA DE APERTURA (Primera orden del ciclo)
        const currentPPC = parseFloat(botState.sppc || 0);
        const pendingOrder = botState.slastOrder; 

        if ((!currentPPC || currentPPC === 0) && !pendingOrder) {
            const purchaseAmount = parseFloat(config.short?.purchaseUsdt || 0);
            const currentSBalance = parseFloat(botState.sbalance || 0);

            // Verificamos fondos tanto en el balance interno del bot como en el real del Exchange
            if (availableUSDT >= purchaseAmount && currentSBalance >= purchaseAmount) {
                log(`🚀 [S-SELL] Iniciando ciclo Short. Vendiendo ${purchaseAmount} USDT...`, 'info');
                await placeFirstShortOrder(config, botState, log, updateBotState, updateGeneralBotState, currentPrice, userId);
            } else {
                log(`⚠️ [S-SELL] Fondos insuficientes para abrir posición Short.`, 'warning');
                await updateBotState('STOPPED', SSTATE);
            }
            return;
        }

        // 4. EVALUACIÓN DE TAKE PROFIT (Hacia S-BUYING para el Trailing Stop)
        const targetActivation = botState.stprice || 0; 
        if (targetActivation > 0 && currentPrice <= targetActivation) {
            log(`💰 [S-SELL] Target alcanzado (${targetActivation.toFixed(2)}). Activando Trailing Stop en BUYING...`, 'success');
            
            // Reset de trailing para este usuario específico
            await updateGeneralBotState({
                spm: 0, 
                spc: 0 
            });

            await updateBotState('BUYING', SSTATE);
            return;
        }

        // 5. DCA EXPONENCIAL (Protección si el precio sube)
        const requiredAmount = parseFloat(botState.srca || 0); 
        const nextCoveragePrice = parseFloat(botState.sncp || 0); 
        const lastExecutionPrice = parseFloat(botState.slep || 0);

        // En Short, el DCA se dispara si el precio es mayor o igual al objetivo
        const isPriceHighEnough = nextCoveragePrice > 0 && currentPrice >= nextCoveragePrice;

        if (!pendingOrder && isPriceHighEnough) {
            
            // 🛡️ SECURITY LOCK: No permitir DCA si el precio bajó del último punto de ejecución
            if (currentPrice <= lastExecutionPrice) {
                return; 
            }

            const hasBalance = botState.sbalance >= requiredAmount && availableUSDT >= requiredAmount;

            if (hasBalance && requiredAmount > 0) {
                log(`📈 [S-SELL] Precio por encima de DCA. Incrementando cobertura...`, 'warning');
                try {
                    await placeCoverageShortOrder(botState, requiredAmount, log, updateGeneralBotState, updateBotState, currentPrice, userId);
                } catch (error) {
                    log(`❌ [S-SELL] Error al colocar cobertura: ${error.message}`, 'error');
                }
            } else {
                log(`🚫 [S-SELL] DCA fallido por falta de saldo. Pausando bot.`, 'error');
                await updateBotState('PAUSED', SSTATE);
            }
            return;
        }

    } catch (criticalError) {
        log(`🔥 [CRITICAL] Error en SSelling: ${criticalError.message}`, 'error');
    }
}

module.exports = { run };