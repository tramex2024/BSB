// BSB/server/src/states/long/LBuying.js

const autobotCore = require('../../autobotLogic');
const { checkAndPlaceCoverageOrder } = require('../../checkAndPlaceCoverageOrder'); // Extraer esta función
const { cancelActiveOrders } = require('../../cancelActiveOrders'); // Extraer esta función
const { placeSellOrder } = require('../../placeSellOrder'); // Extraer esta función

async function run(dependencies) {
    const { botState, currentPrice, availableUSDT, config, creds } = dependencies;

    autobotCore.log("Estado Long: BUYING. Gestionando compras de cobertura...", 'info');

    await checkAndPlaceCoverageOrder(botState, availableUSDT, currentPrice);

    const { ppc, ac } = botState.lStateData;
    const triggerPercentage = config.long.trigger;

    if (ppc > 0 && triggerPercentage > 0) {
        const targetSellPrice = ppc * (1 + (triggerPercentage / 100));

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