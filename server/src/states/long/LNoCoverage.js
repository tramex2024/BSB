// BSB/server/src/states/long/LNoCoverage.js (ACTUALIZADO)

const { cancelActiveOrders, MIN_USDT_VALUE_FOR_BITMART } = require('../../utils/orderManager');

async function run(dependencies) {
    // Extraemos las funciones de las dependencias
    const { botState, currentPrice, availableUSDT, config, creds, log, updateBotState } = dependencies;

    log("Estado Long: NO_COVERAGE. Esperando fondos o precio de venta.", 'warning');

    const { ac } = botState.lStateData;
    
    // --- 1. VERIFICACIÓN DE TRANSICIÓN A VENTA (Ganancia alcanzada) ---
    const targetSellPrice = botState.lStateData.LTPrice || 0; 

    if (currentPrice >= targetSellPrice && ac > 0 && targetSellPrice > 0) {
        log(`Precio actual alcanzó el objetivo de venta (${targetSellPrice.toFixed(2)}) desde NO_COVERAGE.`, 'success');
        
        if (botState.lStateData.lastOrder && botState.lStateData.lastOrder.order_id) {
            // Llama a la función y pasa log
            await cancelActiveOrders(creds, botState, log);
        }
        
        await updateBotState('SELLING', botState.sstate); // Usamos la función inyectada
        return;
    }

    // --- 2. VERIFICACIÓN DE TRANSICIÓN A COMPRA (Fondos recuperados) ---
    const requiredAmount = botState.lStateData.requiredCoverageAmount || 0;
    
    // Transicionar solo si el balance cubre el monto requerido y el mínimo de BitMart
    if (availableUSDT >= requiredAmount && requiredAmount >= MIN_USDT_VALUE_FOR_BITMART) {
        log(`Fondos recuperados (${availableUSDT.toFixed(2)} USDT). Monto requerido (${requiredAmount.toFixed(2)} USDT). Volviendo a BUYING.`, 'success');
        
        await updateBotState('BUYING', botState.sstate); // Usamos la función inyectada
    }
}

module.exports = { run };