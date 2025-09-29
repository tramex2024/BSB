// BSB/server/src/states/long/LBuying.js (ACTUALIZADO)

const { checkAndPlaceCoverageOrder } = require('../../utils/coverageLogic'); 
const { cancelActiveOrders } = require('../../utils/orderManager');

async function run(dependencies) {
    // Extraemos todas las dependencias necesarias, incluyendo las funciones de actualización
    const { botState, currentPrice, availableUSDT, config, creds, log, updateBotState, updateLStateData } = dependencies;

    log("Estado Long: BUYING. Gestionando compras de cobertura...", 'info');

    // LLAMADA ACTUALIZADA: Pasamos las funciones de persistencia y log como argumentos.
    await checkAndPlaceCoverageOrder(botState, availableUSDT, currentPrice, creds, config, log, updateBotState, updateLStateData); 

    const { ppc, ac } = botState.lStateData;
    const triggerPercentage = config.long.trigger;

    if (ppc > 0 && triggerPercentage > 0) {
        const targetSellPrice = ppc * (1 + (triggerPercentage / 100));

        // CRÍTICO: Guardar el Precio Objetivo
        if (botState.lStateData.LTPrice !== targetSellPrice) {
            botState.lStateData.LTPrice = targetSellPrice;
            await updateLStateData(botState.lStateData); // Usamos la función inyectada
        }

        if (currentPrice >= targetSellPrice && ac > 0) {
            log(`Precio actual (${currentPrice.toFixed(2)}) alcanzó el objetivo de venta por TRIGGER (${targetSellPrice.toFixed(2)}).`, 'success');

            if (botState.lStateData.lastOrder && botState.lStateData.lastOrder.order_id) {
                // Llama a la función y pasa log
                await cancelActiveOrders(creds, botState, log); 
            }
            
            await updateBotState('SELLING', botState.sstate); // Usamos la función inyectada
        }
    }
}

module.exports = { run };