// BSB/server/src/states/long/LBuying.js (FINAL - CON CORRECCIÓN DE LLAMADA DE SERVICIO)

const { checkAndPlaceCoverageOrder } = require('../../utils/coverageLogic'); 
const { cancelActiveOrders } = require('../../utils/orderManager');
const { getOrderDetail } = require('../../../services/bitmartService'); 
const { handleSuccessfulBuy } = require('../../utils/dataManager'); 

async function run(dependencies) {
    // Dependencias extendidas
    const { 
        botState, currentPrice, config, creds, log, 
        updateBotState, updateLStateData, updateGeneralBotState,
    } = dependencies;
    
    // Forzamos SYMBOL a ser cadena de texto (como precaución)
    const SYMBOL = String(config.symbol || 'BTC_USDT'); 

    log("Estado Long: BUYING. Verificando el estado de la última orden o gestionando compras de cobertura...", 'info');
    
    // =================================================================
    // === [ BLOQUE CRÍTICO DE RECUPERACIÓN DE SERVIDOR ] ================
    // =================================================================
    const lastOrder = botState.lStateData.lastOrder;

    // Verificar si hay una orden de compra pendiente registrada en la DB
    if (lastOrder && lastOrder.order_id && lastOrder.side === 'buy') {
        
        const orderIdString = String(lastOrder.order_id); 
        
        log(`Recuperación: Orden de compra pendiente con ID ${orderIdString} detectada en DB. Consultando BitMart...`, 'warning');

        try {
            // 1. Consultar el estado real de la orden en BitMart            
            const orderDetails = await getOrderDetail(creds, SYMBOL, orderIdString);
            
            if (orderDetails && orderDetails.state === 'filled') {
                log(`Recuperación exitosa: La orden ID ${orderIdString} se completó durante el tiempo de inactividad.`, 'success');
                
                // Procesar la compra exitosa y actualizar el estado
                await handleSuccessfulBuy(botState, orderDetails, updateGeneralBotState);
                
                await updateBotState('RUNNING', 'long'); 
                return;

            } else if (orderDetails && (orderDetails.state === 'new' || orderDetails.state === 'partially_filled')) {
                log(`Recuperación: La orden ID ${orderIdString} sigue ${orderDetails.state} en BitMart. Esperando.`, 'info');
                
            } else {
                log(`La orden ID ${orderIdString} no está activa ni completada. Asumiendo fallo y liberando el ciclo. Estado: ${orderDetails ? orderDetails.state : 'No Encontrada'}`, 'error');
                
                // Limpiar lastOrder
                botState.lStateData.lastOrder = null;
                await updateLStateData(botState.lStateData);
                
                // Volver a RUNNING
                await updateBotState('RUNNING', 'long');
                return; 
            }

        } catch (error) {
            log(`Error al consultar orden en BitMart durante la recuperación: ${error.message}`, 'error');
            // Mantenemos el estado BUYING
        }
    }
    // =================================================================
    // === [ FIN DEL BLOQUE DE RECUPERACIÓN ] ============================
    // =================================================================

    // Lógica NORMAL de Cobertura
    // checkAndPlaceCoverageOrder DEBE usar el LBalance y el Saldo Real
    await checkAndPlaceCoverageOrder(
        dependencies.botState, 
        dependencies.availableUSDT, 
        currentPrice, 
        creds, 
        config, 
        log, 
        updateBotState, 
        updateLStateData,
        updateGeneralBotState
    ); 

    // Lógica del TRIGGER de VENTA
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
            
            await updateBotState('SELLING', 'long');
        }
    }
}

module.exports = { run };