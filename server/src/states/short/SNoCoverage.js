// BSB/server/src/states/short/SNoCoverage.js (INVERTIDO DE LNoCoverage.js)

const { cancelActiveOrders } = require('../../utils/orderManager');
// Nota: MIN_USDT_VALUE_FOR_BITMART se usará para verificar el valor del BTC a vender.

async function run(dependencies) {
    // Extraemos las funciones de las dependencias
    const { botState, currentPrice, availableBTC, config, creds, log, updateBotState } = dependencies;
    const { MIN_USDT_VALUE_FOR_BITMART } = config; // Asumo que MIN_USDT_VALUE_FOR_BITMART está disponible via config o dependencies si no está en orderManager.

    log("Estado Short: NO_COVERAGE. Esperando BTC disponible o precio de recompra.", 'warning');

    const { av } = botState.sStateData; // 'av' es el BTC vendido, que se debe recomprar.
    
    // --- 1. VERIFICACIÓN DE TRANSICIÓN A RECOMPRA (Ganancia alcanzada) ---
    // En Short, la liquidación (BUYING) se activa cuando el precio BAJA al objetivo (LTPrice).
    const targetBuyPrice = botState.sStateData.LTPrice || 0; 

    if (currentPrice <= targetBuyPrice && av > 0 && targetBuyPrice > 0) { // Invertido: <= y usamos 'av'
        log(`Precio actual alcanzó el objetivo de recompra (${targetBuyPrice.toFixed(2)}) desde NO_COVERAGE. Transicionando a BUYING.`, 'success');
        
        if (botState.sStateData.lastOrder && botState.sStateData.lastOrder.order_id) {
            // Cancelar órdenes activas
            await cancelActiveOrders(creds, botState, log);
        }
        
        // Transicionamos a BUYING (Recompra/Liquidación)
        await updateBotState('BUYING', 'short');
        return;
    }

    // --- 2. VERIFICACIÓN DE TRANSICIÓN A COBERTURA (Capital BTC recuperado) ---
    // Invertido: Revisamos si el BTC disponible (capital operativo) cubre la orden requerida.
    const requiredAmount = botState.sStateData.requiredCoverageAmount || 0;
    
    // Verificamos si el capital real (availableBTC) cubre la orden requerida
    // Y si el valor de esa orden cumple con el mínimo de BitMart.
    const requiredValueInUsdt = requiredAmount * currentPrice;

    if (availableBTC >= requiredAmount && requiredValueInUsdt >= MIN_USDT_VALUE_FOR_BITMART) {
        log(`BTC disponible recuperado (${availableBTC.toFixed(8)} BTC). Monto requerido (${requiredAmount.toFixed(8)} BTC). Volviendo a SELLING.`, 'success');
        
        // Transicionamos a SELLING (para intentar colocar la orden de cobertura)
        await updateBotState('SELLING', 'short');
    }
}

module.exports = { run };