//BSB/server/src/au/states/short/SSelling.js

const { placeFirstShortOrder, placeCoverageShortOrder } = require('../../managers/shortOrderManager');
const { monitorAndConsolidateShort: monitorShortSell } = require('./ShortSellConsolidator');

/**
 * SELLING STATE (SHORT):
 * Gestiona la apertura de cortos y las coberturas exponenciales (DCA hacia arriba).
 */
async function run(dependencies) {
    const {
        userId, // <--- IDENTIDAD INYECTADA
        botState, currentPrice, config, log,
        updateBotState, updateSStateData, updateGeneralBotState,
        availableUSDT
    } = dependencies;

    const SYMBOL = String(config.symbol || 'BTC_USDT');
    const SSTATE = 'short';

    try {
        // 1. ACTIVE ORDERS MONITORING
        // Pasamos el userId para que el monitor sepa qué órdenes de qué usuario validar
        const orderIsActive = await monitorShortSell(
            botState, SYMBOL, log, updateSStateData, updateBotState, updateGeneralBotState, userId
        );
        if (orderIsActive) return; 

        // 2. MONITORING LOG (Sincronizado al Dashboard del usuario)
        if (botState.sppc > 0) {
            const nextPrice = botState.sncp || 0; 
            const targetActivation = botState.stprice || 0; 
            
            const distToDCA = nextPrice > 0 ? Math.abs(((nextPrice / currentPrice) - 1) * 100).toFixed(2) : "0.00";
            const distToTP = targetActivation > 0 ? Math.abs(((currentPrice / targetActivation) - 1) * 100).toFixed(2) : "0.00";
            const pnlActual = botState.sprofit || 0;

            const signDCA = nextPrice > currentPrice ? '+' : '-';
            const signTP = targetActivation > currentPrice ? '+' : '-';
            
            log(`[S-SELLING] 👁️ BTC: ${currentPrice.toFixed(2)} | DCA: ${nextPrice.toFixed(2)} (${signDCA}${distToDCA}%) | TP Target: ${targetActivation.toFixed(2)} (${signTP}${distToTP}%) | PNL: ${pnlActual.toFixed(2)} USDT`, 'info');
        }

        // 3. OPENING LOGIC
        const currentPPC = parseFloat(botState.sppc || 0);
        const pendingOrder = botState.slastOrder; 

        if ((!currentPPC || currentPPC === 0) && !pendingOrder) {
            const purchaseAmount = parseFloat(config.short?.purchaseUsdt || 0);
            const currentSBalance = parseFloat(botState.sbalance || 0);

            if (availableUSDT >= purchaseAmount && currentSBalance >= purchaseAmount) {
                log(`🚀 [S-SELL] Starting Short cycle. Placing first order of ${purchaseAmount} USDT.`, 'info');
                // PASAMOS userId AL MANAGER PARA LA PERSISTENCIA
                await placeFirstShortOrder(config, botState, log, updateBotState, updateGeneralBotState, currentPrice, userId);
            } else {
                log(`⚠️ [S-SELL] Insufficient funds to open Short position.`, 'warning');
                await updateBotState('STOPPED', SSTATE);
            }
            return;
        }

        // 4. ACTIVATION EVALUATION (Hacia S-BUYING para el Trailing Stop)
        const targetActivation = botState.stprice || 0; 
        if (targetActivation > 0 && currentPrice <= targetActivation) {
            log(`💰 [S-SELL] Target (${targetActivation.toFixed(2)}) reached. Activating Trailing Stop in BUYING...`, 'success');
            
            await updateGeneralBotState({
                spm: 0, 
                spc: 0 
            });

            await updateBotState('BUYING', SSTATE);
            return;
        }

        // 5. EXPONENTIAL DCA (Protección contra subidas)
        const requiredAmount = parseFloat(botState.srca || 0); 
        const nextCoveragePrice = parseFloat(botState.sncp || 0); 
        const lastExecutionPrice = parseFloat(botState.slep || 0);

        const isPriceHighEnough = nextCoveragePrice > 0 && currentPrice >= nextCoveragePrice;

        if (!pendingOrder && isPriceHighEnough) {
            
            // 🛡️ SECURITY LOCK: Evita DCA en el mismo nivel o inferior
            if (currentPrice <= lastExecutionPrice) {
                log(`[S-SELL] 🛑 Security Lock: Price (${currentPrice.toFixed(2)}) is not higher than last execution (${lastExecutionPrice.toFixed(2)}).`, 'warning');
                return; 
            }

            const hasBalance = botState.sbalance >= requiredAmount && availableUSDT >= requiredAmount;

            if (hasBalance && requiredAmount > 0) {
                log(`📈 [S-SELL] Price above DCA. Increasing coverage...`, 'warning');
                try {
                    // PASAMOS userId AL MANAGER
                    await placeCoverageShortOrder(botState, requiredAmount, log, updateGeneralBotState, updateBotState, currentPrice, userId);
                } catch (error) {
                    log(`❌ [S-SELL] Failed to place coverage: ${error.message}`, 'error');
                }
            } else {
                log(`🚫 [S-SELL] DCA failed due to insufficient balance.`, 'error');
                await updateBotState('PAUSED', SSTATE);
            }
            return;
        }

    } catch (criticalError) {
        log(`🔥 [CRITICAL] SSelling: ${criticalError.message}`, 'error');
    }
}

module.exports = { run };