// BSB/server/src/states/long/LSelling.js (ETAPA 2: Con Consolidator de Venta)

const { placeSellOrder } = require('../../managers/longOrderManager');
// 🛑 NUEVA IMPORTACIÓN: Traer el handler de vuelta al estado desde longDataManager
const { handleSuccessfulSell } = require('../../managers/longDataManager'); 
const { getOrderDetail, getRecentOrders } = require('../../../services/bitmartService');
const { saveExecutedOrder } = require('../../../services/orderPersistenceService');
// La importación de cycleLogService ya no es necesaria, pero la dejamos para consistencia si no quieres tocar nada más.
const { logSuccessfulCycle } = require('../../../services/cycleLogService'); 

const MIN_SELL_AMOUNT_BTC = 0.00005;
const LSTATE = 'long';    
const TRAILING_STOP_PERCENTAGE = 0.4;    
// 🛑 SELL_FEE_PERCENT ELIMINADO (movido a longDataManager.js)


// =========================================================================
// FUNCIÓN HANDLER: LÓGICA DE RECUPERACIÓN DE CAPITAL Y CIERRE DE CICLO
// 🛑 ESTA FUNCIÓN handleSuccessfulSell FUE ELIMINADA y MOVÍDA a longDataManager.js
// =========================================================================


// =========================================================================
// FUNCIÓN PRINCIPAL DE GESTIÓN DEL ESTADO SELLING
// =========================================================================

async function run(dependencies) {
	const { botState, currentPrice, config, log, updateLStateData, updateBotState, updateGeneralBotState } = dependencies;
	
	// =================================================================
	// === [ BLOQUE CRÍTICO DE RECUPERACIÓN / CONSOLIDATOR DE VENTA ] ====
	// =================================================================
	const lastOrder = botState.lStateData.lastOrder;
	const SYMBOL = config.symbol || 'BTC_USDT';

	if (lastOrder && lastOrder.order_id && lastOrder.side === 'sell') {
		log(`Recuperación: Orden de venta pendiente con ID ${lastOrder.order_id} detectada en DB. Consultando BitMart...`, 'warning');

		try {
			// 1. Consultar el estado real de la orden en BitMart
			const orderDetails = await getOrderDetail(SYMBOL, lastOrder.order_id);

			const isOrderFilled = orderDetails && (orderDetails.state === 'filled' ||    
				(orderDetails.state === 'partially_canceled' && parseFloat(orderDetails.filled_volume || 0) > 0));

			if (isOrderFilled) {
				// Caso A: ORDEN LLENADA (Éxito)
				log(`Recuperación exitosa: La orden ID ${lastOrder.order_id} se completó durante el tiempo de inactividad.`, 'success');
				const handlerDependencies = { config, log, updateBotState, updateLStateData, updateGeneralBotState };
				// 🛑 LLAMADA A LA FUNCIÓN MOVIDA (Ahora importada de longDataManager)
				await handleSuccessfulSell(botState, orderDetails, handlerDependencies);    
				return;
			} else if (orderDetails && (orderDetails.state === 'new' || orderDetails.state === 'partially_filled')) {
				// Caso B: ORDEN AÚN ACTIVA (Esperar)
				log(`Recuperación: La orden ID ${lastOrder.order_id} sigue ${orderDetails.state} en BitMart. Esperando ejecución.`, 'info');
				return;
			} else {
				// Caso C: ORDEN CANCELADA o NO ENCONTRADA (Intentar Consolidar)
				log(`La orden ID ${lastOrder.order_id} no está activa ni completada. Intentando consolidación de venta...`, 'warning');
				
				// -----------------------------------------------------------
				// 💡 CONSOLIDATOR DE VENTA: BUSCAR EN EL HISTORIAL + VALIDACIÓN DE VOLUMEN (CRÍTICO)
				// -----------------------------------------------------------
				const acSelling = botState.lStateData.ac; // Cantidad que el bot esperaba vender
				const recentOrders = await getRecentOrders(SYMBOL, 10);
				const executedOrder = recentOrders.find(o =>
					o.order_id === lastOrder.order_id &&
					o.side === 'sell' &&
					o.status === 'filled'
				);

				if (executedOrder) {
					const filledVolume = parseFloat(executedOrder.filled_volume || executedOrder.filledSize || 0);

					if (Math.abs(filledVolume - acSelling) < 1e-8) {
						// Caso C.1: ORDEN ENCONTRADA EN EL HISTORIAL Y VOLUMEN COINCIDE (Consolidación Exitosa y COMPLETA)
						log(`Consolidator de Venta: Orden ${lastOrder.order_id} encontrada como 'filled' en el historial. Procediendo al cierre.`, 'success');
						const handlerDependencies = { config, log, updateBotState, updateLStateData, updateGeneralBotState };
						// 🛑 LLAMADA A LA FUNCIÓN MOVIDA
						await handleSuccessfulSell(botState, executedOrder, handlerDependencies);
						return;
					} else {
						log(`ADVERTENCIA: Orden ${lastOrder.order_id} encontrada en historial, pero el volumen (${filledVolume.toFixed(8)} BTC) NO coincide con el AC interno (${acSelling.toFixed(8)} BTC). Mantenemos lastOrder para reintentar/investigar.`, 'warning');
						return; // Mantener el bloqueo hasta que se resuelva
					}
				}
				// -----------------------------------------------------------
				// 💡 FIN CONSOLIDATOR
				// -----------------------------------------------------------

				// Si no se consolidó, asumimos fallo total
				log(`Consolidator de Venta fallido: La orden ${lastOrder.order_id} no se encontró ejecutada. Limpiando lastOrder.`, 'error');
				await updateLStateData({ 'lastOrder': null });
				// 3. Continuar la ejecución del código para intentar colocar la orden de venta de nuevo.
			}
		} catch (error) {
		// 🛑 MANEJO DE ERROR 50005 Y OTROS ERRORES
		if (error.message.includes('50005')) {
			log(`Advertencia: Orden ${lastOrder.order_id} desapareció del historial reciente (Error 50005). Asumiendo llenado instantáneo y forzando cierre de ciclo.`, 'warning');
			
			await updateLStateData({ 'lastOrder': null });    
			
			const handlerDependencies = { config, log, updateBotState, updateLStateData, updateGeneralBotState };
			// Nota: Aquí estamos asumiendo que el lleno fue total (filled_volume = ac)
			// 🛑 LLAMADA A LA FUNCIÓN MOVIDA
			await handleSuccessfulSell(botState, { priceAvg: currentPrice, filled_volume: botState.lStateData.ac, orderId: lastOrder.order_id, side: 'sell' }, handlerDependencies);
			
			return;
		}

			log(`Error al consultar orden en BitMart durante la recuperación: ${error.message}`, 'error');
			return;
		}
	}
	// =================================================================
	// === [ FIN DEL BLOQUE DE RECUPERACIÓN / CONSOLIDATOR ] =============
	// =================================================================
	
	// El código de abajo es la Lógica Normal de Trailing Stop

	const { ac: acSelling, pm } = botState.lStateData;

	log("Estado Long: SELLING. Gestionando ventas...", 'info');
	
	const trailingStopPercent = TRAILING_STOP_PERCENTAGE / 100;

	// 1. CÁLCULO DEL TRAILING STOP
	const newPm = Math.max(pm || 0, currentPrice);
	const newPc = newPm * (1 - trailingStopPercent);

	// 2. ACTUALIZACIÓN Y PERSISTENCIA DE DATOS (PM y PC)
	if (newPm > (pm || 0)) {
		log(`Trailing Stop: PM actualizado a ${newPm.toFixed(2)}. PC actualizado a ${newPc.toFixed(2)} (${TRAILING_STOP_PERCENTAGE}% caída).`, 'info');

		await updateLStateData({ pm: newPm, pc: newPc });
        await updateGeneralBotState({ lsprice: newPc });
        log(`lsprice actualizado al valor de PC: ${newPc.toFixed(2)}.`, 'info');
	} else {
		log(`Esperando condiciones para la venta. Precio actual: ${currentPrice.toFixed(2)}, PM: ${newPm.toFixed(2)}, PC: ${newPc.toFixed(2)}`, 'info');
	}
	
	// 3. CONDICIÓN DE VENTA Y LIQUIDACIÓN
	if (acSelling >= MIN_SELL_AMOUNT_BTC && !lastOrder) {
	if (currentPrice <= newPc) {
		log(`Condiciones de venta por Trailing Stop alcanzadas. Colocando orden de venta a mercado para liquidar ${acSelling.toFixed(8)} BTC.`, 'success');
		
        try {
            await placeSellOrder(config, botState, acSelling, log);    
        } catch (error) {
            log(`Error CRÍTICO al colocar la orden de venta: ${error.message}`, 'error');
            
            // 🚨 MANEJO DEL BALANCE INSUFICIENTE (Mantiene AC, transiciona a NO_COVERAGE)
            if (error.message.includes('Balance not enough') || error.message.includes('volume too small')) {
                log('Error CRÍTICO: El bot no puede vender el activo. MANTENIENDO AC, deteniendo el trading y transicionando a NO_COVERAGE para investigación.', 'error');
                
                await updateBotState('NO_COVERAGE', LSTATE);    
                
                return;
            }    
            
            return;
        }
    }
}
}

module.exports = {    
	run,    
	// 🛑 handleSuccessfulSell ELIMINADO de la exportación, ya que se encuentra en longDataManager.js
};