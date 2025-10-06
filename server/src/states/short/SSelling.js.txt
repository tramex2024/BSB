// BSB/server/src/states/short/SSelling.js (Consumo de SBalance)

const { checkAndPlaceCoverageOrder } = require('../../utils/coverageLogicShort'); // Crear una nueva lógica de cobertura para Short
const { cancelActiveOrders } = require('../../utils/orderManager');

// CONSTANTES (Ajustar según la estrategia Short)
const SSTATE = 'short';
const TRAILING_STOP_PERCENTAGE = 0.4; 

async function run(dependencies) {
    // Extraemos TODAS las dependencias necesarias
    const { 
        botState, currentPrice, availableBTC, config, creds, log, 
        updateBotState, updateLStateData, updateGeneralBotState // Incluimos la función de guardado genérica
    } = dependencies;
    
    // NOTA IMPORTANTE: Para la estrategia Short, la orden de cobertura es una VENTA.
    // Usaremos una función similar a la de Long, pero adaptada para el Short.
    // La llamaremos checkAndPlaceCoverageOrderShort (o si tu CoverageLogic ya maneja Short, usa la misma).

    log("Estado Short: SELLING. Gestionando ventas de cobertura (Consumo de SBalance)...", 'info');

    // LLAMADA ACTUALIZADA: Inyectamos todas las funciones necesarias
    // Esta función DEBE contener la lógica para RESTAR el SBalance (BTC).
    await checkAndPlaceCoverageOrderShort( // Usamos una función dedicada para Short para la claridad.
        botState, 
        availableBTC, // Pasamos el saldo de BTC
        currentPrice, 
        creds, 
        config, 
        log, 
        updateBotState, 
        updateLStateData,
        updateGeneralBotState 
    ); 

    const { ppv, av } = botState.sStateData;
    const triggerPercentage = config.short.trigger;

    if (ppv > 0 && triggerPercentage > 0) {
        // La VENTA se activa cuando el precio baja al objetivo de COMPRA (recompra)
        const targetBuyPrice = ppv * (1 - (triggerPercentage / 100));

        // CRÍTICO: Guardar el Precio Objetivo
        if (botState.sStateData.LTPrice !== targetBuyPrice) {
            botState.sStateData.LTPrice = targetBuyPrice;
            await updateLStateData(botState.sStateData); // Usamos la función inyectada para guardar SStateData
        }

        if (currentPrice <= targetBuyPrice && av > 0) {
            log(`Precio actual (${currentPrice.toFixed(2)}) alcanzó el objetivo de recompra por TRIGGER (${targetBuyPrice.toFixed(2)}).`, 'success');

            if (botState.sStateData.lastOrder && botState.sStateData.lastOrder.order_id) {
                // Cancelar órdenes activas (si aplica)
                await cancelActiveOrders(creds, botState, log); 
            }
            
            // Cambiamos el estado de Short a BUYING (Recuperación de capital)
            await updateBotState('BUYING', SSTATE);
        }
    }
}

module.exports = { run };