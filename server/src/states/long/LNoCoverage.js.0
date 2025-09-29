// BSB/server/src/states/long/LNoCoverage.js (Diseño Final)

const autobotCore = require('../../../autobotLogic');
const { cancelActiveOrders, MIN_USDT_VALUE_FOR_BITMART } = require('../../utils/orderManager');

async function run(dependencies) {
    const { botState, currentPrice, availableUSDT, config, creds } = dependencies;

    autobotCore.log("Estado Long: NO_COVERAGE. Esperando fondos o precio de venta.", 'warning');

    const { ac } = botState.lStateData;
    
    // --- 1. VERIFICACIÓN DE TRANSICIÓN A VENTA (Ganancia alcanzada) ---
    // Leemos directamente el precio objetivo (asumiendo que LBuying.js lo guarda como LTPrice)
    const targetSellPrice = botState.lStateData.LTPrice || 0; 

    if (currentPrice >= targetSellPrice && ac > 0 && targetSellPrice > 0) {
        autobotCore.log(`Precio actual alcanzó el objetivo de venta (${targetSellPrice.toFixed(2)}) desde NO_COVERAGE.`, 'success');
        
        if (botState.lStateData.lastOrder && botState.lStateData.lastOrder.order_id) {
            await cancelActiveOrders(creds, botState);
        }
        
        await autobotCore.updateBotState('SELLING', botState.sstate);
        return;
    }

    // --- 2. VERIFICACIÓN DE TRANSICIÓN A COMPRA (Fondos recuperados) ---
    // Leemos directamente el monto que falló (asumiendo que coverageLogic.js lo guarda)
    const requiredAmount = botState.lStateData.requiredCoverageAmount || 0;
    
    // Transicionar solo si el balance cubre el monto requerido y el mínimo de BitMart
    if (availableUSDT >= requiredAmount && requiredAmount >= MIN_USDT_VALUE_FOR_BITMART) {
        autobotCore.log(`Fondos recuperados (${availableUSDT.toFixed(2)} USDT). Monto requerido (${requiredAmount.toFixed(2)} USDT). Volviendo a BUYING.`, 'success');
        
        await autobotCore.updateBotState('BUYING', botState.sstate);
    }
}

module.exports = { run };