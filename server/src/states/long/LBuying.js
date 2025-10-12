// BSB/server/src/states/long/LBuying.js (FINAL - Permite la gestión de LBalance y RECUPERACIÓN)

const { checkAndPlaceCoverageOrder } = require('../../utils/coverageLogic'); 
const { cancelActiveOrders } = require('../../utils/orderManager');
const { getOrderDetail } = require('../../../services/bitmartService'); 
const { handleSuccessfulBuy } = require('../../utils/dataManager'); 

async function run(dependencies) {
    // Dependencias extendidas
    const { 
        botState, currentPrice, config, creds, log, 
        updateBotState, updateLStateData, updateGeneralBotState,
        // Otras dependencias (availableUSDT, availableBTC, etc.) se acceden via dependencies.
    } = dependencies;
    
    const SYMBOL = config.symbol || 'BTC_USDT';

    log("Estado Long: BUYING. Verificando el estado de la última orden o gestionando compras de cobertura...", 'info');
    
    // =================================================================
    // === [ BLOQUE CRÍTICO DE RECUPERACIÓN DE SERVIDOR ] ================
    // =================================================================
    const lastOrder = botState.lStateData.lastOrder;

    // Verificar si hay una orden de compra pendiente registrada en la DB
    if (lastOrder && lastOrder.order_id && lastOrder.side === 'buy') {
        log(`Recuperación: Orden de compra pendiente con ID ${lastOrder.order_id} detectada en DB. Consultando BitMart...`, 'warning');

        try {
            // 1. Consultar el estado real de la orden en BitMart
            const orderDetails = await getOrderDetail(creds, SYMBOL, lastOrder.order_id);
            
            if (orderDetails && orderDetails.state === 'filled') {
                // Caso A: ORDEN LLENADA (Ejecución Exitosa después del reinicio)
                log(`Recuperación exitosa: La orden ID ${lastOrder.order_id} se completó durante el tiempo de inactividad.`, 'success');
                
                // 2. Procesar la compra exitosa y actualizar el estado
                // Usamos el botState actual que se leyó al inicio del ciclo
                await handleSuccessfulBuy(botState, orderDetails, updateGeneralBotState);
                
                // 3. Volver al estado RUNNING para buscar el siguiente punto de venta
                await updateBotState('RUNNING', 'long'); 
                return; // Finaliza la ejecución del BUYING por este ciclo

            } else if (orderDetails && (orderDetails.state === 'new' || orderDetails.state === 'partially_filled')) {
                // Caso B: ORDEN AÚN ACTIVA (Esperar)
                log(`Recuperación: La orden ID ${lastOrder.order_id} sigue ${orderDetails.state} en BitMart. Esperando.`, 'info');
                // El bot se mantiene en estado BUYING y permite que la lógica de cobertura verifique.
                
            } else {
                // Caso C: ORDEN CANCELADA, FALLIDA o NO ENCONTRADA (Inconsistencia o fallo)
                log(`La orden ID ${lastOrder.order_id} no está activa ni completada. Asumiendo fallo y liberando el ciclo. Estado: ${orderDetails ? orderDetails.state : 'No Encontrada'}`, 'error');
                
                // 2. Limpiar lastOrder
                botState.lStateData.lastOrder = null;
                await updateLStateData(botState.lStateData);
                
                // 3. Volver a RUNNING para intentar la compra de nuevo en la próxima iteración.
                await updateBotState('RUNNING', 'long');
                return; // Finaliza la ejecución
            }

        } catch (error) {
            log(`Error al consultar orden en BitMart durante la recuperación: ${error.message}`, 'error');
            // Si falla la consulta, nos mantenemos en BUYING y esperamos al siguiente ciclo.
        }
    }
    // =================================================================
    // === [ FIN DEL BLOQUE DE RECUPERACIÓN ] ============================
    // =================================================================

    // Lógica NORMAL de Cobertura (Se ejecuta si no había orden o si la orden aún está activa - Caso B)
    
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
        updateGeneralBotState // ⬅️ Para actualizar LBalance
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