// BSB/server/src/states/long/LSelling.js (ETAPA 2: Con Consolidator de Venta)

const { placeSellOrder } = require('../../managers/longOrderManager');
const { getOrderDetail, getRecentOrders } = require('../../../services/bitmartService'); // 💡 AÑADIDO getRecentOrders
const { saveExecutedOrder } = require('../../../services/orderPersistenceService');
const { logSuccessfulCycle } = require('../../../services/cycleLogService');

const MIN_SELL_AMOUNT_BTC = 0.00005;

const LSTATE = 'long';    
const TRAILING_STOP_PERCENTAGE = 0.4;    
const SELL_FEE_PERCENT = 0.001; // 0.1%

// =========================================================================
// FUNCIÓN HANDLER: LÓGICA DE RECUPERACIÓN DE CAPITAL Y CIERRE DE CICLO
// (handleSuccessfulSell - SIN CAMBIOS EN ESTE BLOQUE)
// =========================================================================

/**
 * Lógica para manejar una orden de venta exitosa (cierre de ciclo Long).
 * @param {object} botStateObj - Estado del bot antes de la venta.
 * @param {object} orderDetails - Detalles de la orden de BitMart completada.
 * @param {object} dependencies - Dependencias inyectadas (incluye config, log, updateGeneralBotState, etc.).
 */
async function handleSuccessfulSell(botStateObj, orderDetails, dependencies) {
	// Aseguramos la extracción de todas las dependencias necesarias
	const { config, log, updateBotState, updateLStateData, updateGeneralBotState } = dependencies;
	
	try {
		// 1. CÁLCULO DE CAPITAL Y GANANCIA
		const { ac: totalBtcSold } = botStateObj.lStateData; 
        const totalUsdtSpent = botStateObj.lStateData.ai;
		
		const sellPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
		const filledSize = parseFloat(orderDetails.filled_volume || orderDetails.amount || totalBtcSold || 0);
		
		const totalUsdtRecoveredBRUTO = filledSize * sellPrice;
        const sellFeeUsdt = totalUsdtRecoveredBRUTO * SELL_FEE_PERCENT;    
        const totalUsdtRecoveredNETO = totalUsdtRecoveredBRUTO - sellFeeUsdt;
        const profitNETO = totalUsdtRecoveredNETO - totalUsdtSpent;
        
        // ------------------------------------------------------------------------
        // 💡 MODIFICACIÓN: PERSISTENCIA HISTÓRICA DE LA ORDEN DE VENTA (Reforzada)
        // ------------------------------------------------------------------------
        const SYMBOL = config.symbol || 'BTC_USDT';
        const orderToSave = {
            ...orderDetails,
            orderTime: new Date(orderDetails.createTime || orderDetails.orderTime || Date.now()),
            symbol: orderDetails.symbol || SYMBOL,
            type: orderDetails.type || 'MARKET',
            side: 'sell' // Asegurar el lado
        };

        const savedOrder = await saveExecutedOrder(orderToSave, LSTATE);
        if (savedOrder) {
            log(`Orden de VENTA Long ID ${orderDetails.orderId || 'ASUMIDA'} guardada en el historial de Órdenes.`, 'debug');
        }

        // ========================================================================
		// 🟢 BLOQUE: REGISTRO HISTÓRICO DEL CICLO DE TRADING (omito por brevedad, es el mismo)
		// ========================================================================
		const cycleEndTime = new Date();
		const cycleStartTime = botStateObj.lStateData.cycleStartTime;
		let durationHours = null;

		if (cycleStartTime) {
			const durationMs = cycleEndTime.getTime() - cycleStartTime.getTime();
			durationHours = durationMs / (1000 * 60 * 60); 

			const cycleData = {
				strategy: 'Long', cycleIndex: (botStateObj.lcycle || 0) + 1, symbol: config.symbol,
				startTime: cycleStartTime, endTime: cycleEndTime, durationHours: durationHours,
				initialInvestment: totalUsdtSpent, finalRecovery: totalUsdtRecoveredNETO,
				netProfit: profitNETO, profitPercentage: (profitNETO / totalUsdtSpent) * 100,
				averagePPC: botStateObj.lStateData.ppc, finalSellPrice: sellPrice,
				orderCount: botStateObj.lStateData.orderCountInCycle, autobotId: botStateObj._id    
			};

			const savedCycle = await logSuccessfulCycle(cycleData);
			if (savedCycle) {
				log(`Resumen del ciclo Long ${cycleData.cycleIndex} guardado. Ganancia: ${profitNETO.toFixed(2)} USDT.`, 'success');
			} else {
				log(`ADVERTENCIA: Falló el registro del ciclo ${cycleData.cycleIndex} en la DB.`, 'warning');
			}
		} else {
			log('ADVERTENCIA: cycleStartTime faltante. No se pudo registrar el ciclo en el historial.', 'warning');
		}
		// ========================================================================
		// 🟢 FIN DEL BLOQUE DE REGISTRO
		// ========================================================================

		// 2. RECUPERACIÓN DE CAPITAL OPERATIVO Y GANANCIA
		const newLBalance = botStateObj.lbalance + totalUsdtRecoveredNETO;
		
		await updateGeneralBotState({
			lbalance: newLBalance,
			total_profit: (botStateObj.total_profit || 0) + profitNETO,
			ltprice: 0, lsprice: 0, lcoverage: 0, lnorder: 0,
			lcycle: (botStateObj.lcycle || 0) + 1
		});

		log(`Cierre de Ciclo Long Exitoso! Ganancia NETA: ${profitNETO.toFixed(2)} USDT.`, 'success');

		// 3. RESETEO DE DATOS DE CICLO ESPECÍFICOS (lStateData)
		const resetLStateData = {
			ac: 0, ppc: 0, ai: 0, orderCountInCycle: 0, lastOrder: null, pm: 0, pc: 0, pv: 0,
            lastExecutionPrice: 0, nextCoveragePrice: 0, requiredCoverageAmount: 0,
            cycleStartTime: null
		}
		await updateLStateData(resetLStateData);

		// 4. TRANSICIÓN DE ESTADO
        if (config.long.stopAtCycle) {
            log('Configuración: stopAtCycle activado. Bot Long se detendrá.', 'info');
            await updateBotState('STOPPED', LSTATE);
        } else {
            log('Configuración: stopAtCycle desactivado. Transicionando a BUYING para iniciar la nueva compra.', 'info');
            await updateBotState('BUYING', LSTATE);
        }

	} catch (error) {
        // ... (Error de persistencia)
        log(`CRITICAL PERSISTENCE ERROR: Falló el reseteo del estado tras venta exitosa/asumida. Causa: ${error.message}`, 'error');
		log('Intentando limpieza de lastOrder y permitiendo reintento en el próximo ciclo.', 'warning');
		try {
			await updateLStateData({ 'lastOrder': null });
		} catch (dbError) {
			 log(`FALLA DE RECUPERACIÓN: No se pudo limpiar lastOrder. Revise la conexión/estado de la DB.`, 'error');
		}
	}
}

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
				const recentOrders = await getRecentOrders(SYMBOL, 10); // Buscar en las últimas 10 órdenes (ajustar si es necesario)
				const executedOrder = recentOrders.find(o => 
					o.order_id === lastOrder.order_id && 
					o.side === 'sell' && 
					o.status === 'filled'
				);

				if (executedOrder) {
					// 💡 NUEVO: Comprobación estricta de que el volumen vendido coincide con lo que el bot esperaba vender (acSelling)
					const filledVolume = parseFloat(executedOrder.filled_volume || executedOrder.filledSize || 0);

					if (Math.abs(filledVolume - acSelling) < 1e-8) { // Usamos una pequeña tolerancia para flotantes
						// Caso C.1: ORDEN ENCONTRADA EN EL HISTORIAL Y VOLUMEN COINCIDE (Consolidación Exitosa y COMPLETA)
						log(`Consolidator de Venta: Orden ${lastOrder.order_id} encontrada como 'filled' en el historial. Procediendo al cierre.`, 'success');
						const handlerDependencies = { config, log, updateBotState, updateLStateData, updateGeneralBotState };
						await handleSuccessfulSell(botState, executedOrder, handlerDependencies);
						return;
					} else {
						// El volumen no coincide: puede ser un llenado parcial que la API/Historial no reportó correctamente, o un bug.
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
	handleSuccessfulSell
};