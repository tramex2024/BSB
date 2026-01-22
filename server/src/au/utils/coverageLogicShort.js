// BSB/server/src/au/utils/coverageLogicShort.js

const { placeCoverageSellOrder, MIN_USDT_VALUE_FOR_BITMART } = require('../managers/shortOrderManager');

/**
 * Verifica las condiciones de cobertura (DCA UP) para la pierna Short.
 */
async function checkAndPlaceCoverageOrder(botState, availableUSDT, currentPrice, creds, config, log, updateBotState, updateSStateData, updateGeneralBotState) {
    
    const { ppc: pps, lastOrder, requiredCoverageAmount, nextCoveragePrice: dbNextPrice } = botState.sStateData;
    const { price_var, size_var } = config.short; 
    const currentSBalance = parseFloat(botState.sbalance || 0);

    // 1. BLOQUEO DE ORDEN DUPLICADA
    if (lastOrder && (lastOrder.state === 'pending_fill' || lastOrder.state === 'new')) {
        return; // Ya hay una orden trabajando
    }

    // 2. VALIDACIÓN DE INICIALIZACIÓN
    if (pps <= 0 || !dbNextPrice) {
        return;
    }

    // 3. CÁLCULO DE MONTO (Lógica Exponencial)
    // Priorizamos el valor pre-calculado para mantener la progresión geométrica exacta
    let nextUSDTNotional = parseFloat(requiredCoverageAmount || 0);
    
    if (nextUSDTNotional === 0) {
        const lastAmount = parseFloat(lastOrder?.usdt_amount || config.short.purchaseUsdt || 0);
        nextUSDTNotional = lastAmount * (1 + (size_var / 100));
    }

    const nextCoveragePrice = parseFloat(dbNextPrice);

    // 4. CONDICIÓN DE DISPARO (Short dispara si el precio SUBE)
    if (currentPrice >= nextCoveragePrice) { 
        
        const nextSellAmountBTC = nextUSDTNotional / currentPrice;

        log(`🚀 Disparo Short (DCA UP): Obj ${nextCoveragePrice.toFixed(2)} | Monto: ${nextUSDTNotional.toFixed(2)} USDT`, 'info');

        // 5. VERIFICACIÓN DE FONDOS
        const isSufficient = currentSBalance >= nextUSDTNotional && 
                             availableUSDT >= nextUSDTNotional && 
                             nextUSDTNotional >= MIN_USDT_VALUE_FOR_BITMART;

        if (isSufficient) {
            // NOTA: Se recomienda que la resta de SBalance ocurra dentro de placeCoverageSellOrder
            // para mantener la atomicidad, igual que en Long.
            await placeCoverageSellOrder(botState, creds, nextSellAmountBTC, nextCoveragePrice, log, updateBotState, updateGeneralBotState); 

        } else {
            const reason = currentSBalance < nextUSDTNotional ? 'SBalance Insuficiente' : 'Saldo API Insuficiente';
            log(`⚠️ Cobertura Short abortada: ${reason}`, 'warning');
            await updateBotState('SH_NO_COVERAGE', 'short');
        }
    }
}

module.exports = { checkAndPlaceCoverageOrder };