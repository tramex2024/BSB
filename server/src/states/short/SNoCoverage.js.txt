// BSB/server/src/states/short/SNoCoverage.js (INVERTIDO Y COMPLETO)

const { cancelActiveOrders, MIN_USDT_VALUE_FOR_BITMART } = require('../../utils/orderManager');

async function run(dependencies) {
    // Extraemos las funciones de las dependencias, usando availableBTC
    const { botState, currentPrice, availableBTC, config, creds, log, updateBotState } = dependencies;

    log("Estado Short: NO_COVERAGE. Esperando BTC disponible o precio de recompra.", 'warning');

    const { av, requiredCoverageAmount } = botState.sStateData; // 'av' es el BTC vendido
    const requiredAmount = requiredCoverageAmount || 0;
    
    // --- 1. VERIFICACIÓN DE TRANSICIÓN A RECOMPRA (Ganancia alcanzada) ---
    // En Short, la liquidación (BUYING) se activa cuando el precio BAJA al objetivo (LTPrice).
    const targetBuyPrice = botState.sStateData.LTPrice || 0; 

    if (currentPrice <= targetBuyPrice && av > 0 && targetBuyPrice > 0) { // Invertido: <=
        log(`Precio actual alcanzó el objetivo de recompra (${targetBuyPrice.toFixed(2)}) desde NO_COVERAGE.`, 'success');
        
        if (botState.sStateData.lastOrder && botState.sStateData.lastOrder.order_id) {
            // Cancelar órdenes activas
            await cancelActiveOrders(creds, botState, log);
        }
        
        // Transicionamos a BUYING (Recompra/Liquidación)
        await updateBotState('BUYING', 'short');
        return;
    }

    // --- 2. VERIFICACIÓN DE TRANSICIÓN A COBERTURA (Capital BTC recuperado) ---
    // Revisamos si el BTC disponible (capital operativo) cubre la orden requerida.
    
    // El monto requerido en BTC debe ser validado por su valor mínimo en USDT
    const requiredValueInUsdt = requiredAmount * currentPrice;

    if (availableBTC >= requiredAmount && requiredValueInUsdt >= MIN_USDT_VALUE_FOR_BITMART) {
        log(`BTC disponible recuperado (${availableBTC.toFixed(8)} BTC). Monto requerido (${requiredAmount.toFixed(8)} BTC). Volviendo a SELLING.`, 'success');
        
        // Transicionamos a SELLING (para intentar colocar la orden de cobertura)
        await updateBotState('SELLING', 'short');
    }
}

module.exports = { run };