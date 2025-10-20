// BSB/server/src/states/long/LBuying.js (VERSIÓN FINAL CON CORRECCIONES DE LÓGICA DE ESTADO)

const { checkAndPlaceCoverageOrder } = require('../../utils/coverageLogic'); 
const { cancelActiveOrders } = require(/** 'cancelActiveOrders' no se usa aquí, pero se mantiene la importación */ '../../utils/orderManager');
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

        log(`[DEBUG - PARAMS] Intentando consultar orden. SYMBOL: '${SYMBOL}', ID: '${orderIdString}'`, 'debug');

        try {
            // 1. Consultar el estado real de la orden en BitMart 
            const orderDetails = await getOrderDetail(SYMBOL, orderIdString);
            
            if (orderDetails && (orderDetails.state === 'filled' || orderDetails.state === 'partially_canceled')) {
                // Si está completada (total o parcial)
                log(`Recuperación exitosa: La orden ID ${orderIdString} se completó/canceló parcialmente.`, 'success');
                
                // Procesar la compra exitosa y actualizar el estado
                // NOTE: handleSuccessfulBuy manejará la transición a SELLING o BUYING y guardará el PM/Qty
                await handleSuccessfulBuy(botState, orderDetails, updateGeneralBotState, log); 
                
                // 🛑 NO REGRESA A RUNNING. El estado lo define handleSuccessfulBuy.
                return;

            } else if (orderDetails && (orderDetails.state === 'new' || orderDetails.state === 'partially_filled')) {
                log(`Recuperación: La orden ID ${orderIdString} sigue ${orderDetails.state} en BitMart. Esperando.`, 'info');
                
            } else {
                // Asumiendo fallo (e.g., canceled, o no encontrada).
                log(`La orden ID ${orderIdString} no está activa ni completada. Estado: ${orderDetails ? orderDetails.state : 'No Encontrada'}. Limpiando lastOrder.`, 'error');
                
                // Limpiar lastOrder
                botState.lStateData.lastOrder = null;
                await updateLStateData(botState.lStateData);
                
                // 🛑 NO REGRESA A RUNNING. Se queda en BUYING (o pasa a NO_COVERAGE/STOPPED si el capital se agotó).
                return; 
            }

        } catch (error) {
            log(`Error al consultar orden en BitMart durante la recuperación: ${error.message}`, 'error');
            // Mantenemos el estado BUYING para reintentar la consulta en el siguiente ciclo
        }
    }
    // =================================================================
    // === [ FIN DEL BLOQUE DE RECUPERACIÓN ] ============================
    // =================================================================

    // Lógica NORMAL de Cobertura
    log('Lógica de cobertura: Posición no inicializada o incompleta.', 'info'); // Log para saber que la lógica continúa
    
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
    const triggerPercentage = config.long.profit_percent; // Asumo que trigger ahora es profit_percent
    
    if (ppc > 0 && triggerPercentage > 0 && ac > 0) { // Añadido ac > 0 para asegurar que hay posición
        const targetSellPrice = ppc * (1 + (triggerPercentage / 100));

        // Note: lStateData ya está definido, aquí se usa una variable temporal para la DB.
        if (botState.lStateData.LTPrice !== targetSellPrice) { 
            botState.lStateData.LTPrice = targetSellPrice;
            await updateLStateData(botState.lStateData); // Guardar el nuevo precio objetivo
        }

        // Si el precio de mercado actual alcanza el objetivo de venta
        if (currentPrice >= targetSellPrice) {
            log(`Precio actual (${currentPrice.toFixed(2)}) alcanzó el objetivo de venta por TRIGGER (${targetSellPrice.toFixed(2)}). Transicionando a SELLING.`, 'success'); 
            await updateBotState('SELLING', 'long');
        }
    }
}

module.exports = { run };