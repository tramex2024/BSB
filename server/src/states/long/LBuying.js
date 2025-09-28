// BSB/server/src/states/long/LBuying.js (CORREGIDO Y LISTO)

const autobotCore = require('../../../autobotLogic');
const { checkAndPlaceCoverageOrder } = require('../../utils/coverageLogic'); 
const { cancelActiveOrders } = require('../../utils/orderManager');

async function run(dependencies) {
    const { botState, currentPrice, availableUSDT, config, creds } = dependencies;

    autobotCore.log("Estado Long: BUYING. Gestionando compras de cobertura...", 'info');

    // La lógica de cobertura (checkAndPlaceCoverageOrder) DEBE manejar el guardado de
    // nextCoveragePrice y requiredCoverageAmount, si corresponde.
    await checkAndPlaceCoverageOrder(botState, availableUSDT, currentPrice, creds, config); 

    const { ppc, ac } = botState.lStateData;
    const triggerPercentage = config.long.trigger;

    if (ppc > 0 && triggerPercentage > 0) {
        const targetSellPrice = ppc * (1 + (triggerPercentage / 100));

        // CRÍTICO: Guardar el Precio Objetivo para el Front-End y NO_COVERAGE
        if (botState.lStateData.LTPrice !== targetSellPrice) {
            botState.lStateData.LTPrice = targetSellPrice;
            await autobotCore.updateLStateData(botState.lStateData); // Usando la nueva función
        }

        if (currentPrice >= targetSellPrice && ac > 0) {
            autobotCore.log(`Precio actual (${currentPrice.toFixed(2)}) alcanzó el objetivo de venta por TRIGGER (${targetSellPrice.toFixed(2)}).`, 'success');

            if (botState.lStateData.lastOrder && botState.lStateData.lastOrder.order_id) {
                await cancelActiveOrders(creds, botState);
            }
            
            await autobotCore.updateBotState('SELLING', botState.sstate);
        }
    }
}

module.exports = { run };