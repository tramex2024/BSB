// BSB/server/src/states/long/LBuying.js (FINAL - Permite la gestión de LBalance)

const { checkAndPlaceCoverageOrder } = require('../../utils/coverageLogic'); 
const { cancelActiveOrders } = require('../../utils/orderManager');

async function run(dependencies) {
    // Restauramos updateGeneralBotState de las dependencias
    const { 
        botState, currentPrice, availableUSDT, config, creds, log, 
        updateBotState, updateLStateData, updateGeneralBotState 
    } = dependencies;

    log("Estado Long: BUYING. Gestionando compras de cobertura...", 'info');

    // checkAndPlaceCoverageOrder DEBE usar el LBalance y el Saldo Real
    await checkAndPlaceCoverageOrder(
        botState, 
        availableUSDT, 
        currentPrice, 
        creds, 
        config, 
        log, 
        updateBotState, 
        updateLStateData,
        updateGeneralBotState // ⬅️ CRÍTICO: Para actualizar LBalance
    ); 

    const { ppc, ac } = botState.lStateData;
    const triggerPercentage = config.long.trigger;

    if (ppc > 0 && triggerPercentage > 0) {
        const targetSellPrice = ppc * (1 + (triggerPercentage / 100));

        if (botState.lStateData.LTPrice !== targetSellPrice) {
            botState.lStateData.LTPrice = targetSellPrice;
            await updateLStateData(botState.lStateData);
        }

        if (currentPrice >= targetSellPrice && ac > 0) {
            log(`Precio actual (${currentPrice.toFixed(2)}) alcanzó el objetivo de venta por TRIGGER (${targetSellPrice.toFixed(2)}).`, 'success');

            if (botState.lStateData.lastOrder && botState.lStateData.lastOrder.order_id) {
                await cancelActiveOrders(creds, botState, log); 
            }
            
            await updateBotState('SELLING', 'long');
        }
    }
}

module.exports = { run };