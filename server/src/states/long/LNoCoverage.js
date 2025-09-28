// BSB/server/src/states/long/LNoCoverage.js

const autobotCore = require('../../../autobotLogic');
// Importaciones necesarias para la seguridad y la lógica de reentrada
const { cancelActiveOrders, MIN_USDT_VALUE_FOR_BITMART } = require('../../utils/orderManager'); 

async function run(dependencies) {
    const { botState, currentPrice, availableUSDT, config, creds } = dependencies;

    autobotCore.log("Estado Long: NO_COVERAGE. Esperando fondos o precio de venta.", 'warning');

    const { ppc, ac, orderCountInCycle } = botState.lStateData;
    const triggerPercentage = config.long.trigger;
    const purchaseUsdt = parseFloat(config.long.purchaseUsdt);
    
    // --- 1. VERIFICACIÓN DE TRANSICIÓN A VENTA (Ganancia alcanzada) ---
    // La venta es siempre prioritaria, independientemente de los fondos.
    if (ppc > 0 && triggerPercentage > 0 && ac > 0) {
        const targetSellPrice = ppc * (1 + (triggerPercentage / 100));

        if (currentPrice >= targetSellPrice) {
            autobotCore.log(`Precio actual (${currentPrice.toFixed(2)}) alcanzó el objetivo de venta por TRIGGER (${targetSellPrice.toFixed(2)}) desde NO_COVERAGE. Transicionando a SELLING.`, 'success');
            
            // CORRECCIÓN CRÍTICA: Cancelar órdenes pendientes antes de vender.
            if (botState.lStateData.lastOrder && botState.lStateData.lastOrder.order_id) {
                await cancelActiveOrders(creds, botState);
            }
            
            await autobotCore.updateBotState('SELLING', botState.sstate);
            return; // Salir después de la transición
        }
    }

    // --- 2. VERIFICACIÓN DE TRANSICIÓN A COMPRA (Fondos recuperados) ---
    
    // CALCULO DE LA PRÓXIMA ORDEN REQUERIDA (Monto Escalado)
    // Se utiliza la misma lógica de escalado que en LBuying.js para saber lo que se intentaría comprar.
    const sizeVar = config.long.size_var || 0;
    const orderCount = orderCountInCycle || 0;

    const requiredAmount = purchaseUsdt * (1 + (sizeVar / 100) * orderCount);
    
    // Transicionar solo si el balance cubre la ORDEN ESCALADA y el mínimo de BitMart
    if (availableUSDT >= requiredAmount && requiredAmount >= MIN_USDT_VALUE_FOR_BITMART) {
        autobotCore.log(`Fondos recuperados (${availableUSDT.toFixed(2)} USDT). Monto requerido para cobertura (${requiredAmount.toFixed(2)} USDT). Volviendo a estado BUYING.`, 'success');
        
        // Volvemos a BUYING. El próximo ciclo de LBuying.js intentará colocar la orden de cobertura pendiente.
        await autobotCore.updateBotState('BUYING', botState.sstate);
    }
}

module.exports = { run };