// BSB/server/src/states/long/LBuying.js (ACTUALIZADO - Versión Final)

const { checkAndPlaceCoverageOrder } = require('../../utils/coverageLogic'); 
const { cancelActiveOrders } = require('../../utils/orderManager');

async function run(dependencies) {
    // Extraemos TODAS las dependencias necesarias, incluyendo la nueva función:
    const { 
        botState, currentPrice, availableUSDT, config, creds, log, 
        updateBotState, updateLStateData, updateGeneralBotState // <--- ¡AQUÍ ESTÁ!
    } = dependencies;

    log("Estado Long: BUYING. Gestionando compras de cobertura...", 'info');

    // LLAMADA ACTUALIZADA: Inyectamos la función genérica de actualización
    // NOTA: La lógica para RESTAR el LBalance y cambiar a NO_COVERAGE debe estar 
    // DENTRO de la función checkAndPlaceCoverageOrder.
    await checkAndPlaceCoverageOrder(
        botState, 
        availableUSDT, 
        currentPrice, 
        creds, 
        config, 
        log, 
        updateBotState, 
        updateLStateData,
        updateGeneralBotState // <--- NUEVO ARGUMENTO PASADO AL ORDENADOR
    ); 

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
            
            // Cambiamos el estado de Long a SELLING
            await updateBotState('SELLING', 'long');
        }
    }
}

module.exports = { run };