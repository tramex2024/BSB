// BSB/server/src/states/long/LSelling.js (ETAPA 1: Delega el reinicio a BUYING)

const { placeSellOrder } = require('../../managers/longOrderManager');
const { getOrderDetail } = require('../../../services/bitmartService'); 
const { saveExecutedOrder } = require('../../../services/orderPersistenceService'); // 💡 NUEVA IMPORTACIÓN DE SERVICIO DE PERSISTENCIA
const { logSuccessfulCycle } = require('../../../services/cycleLogService'); // 💡 NUEVA IMPORTACIÓN

const MIN_SELL_AMOUNT_BTC = 0.00005;

// Se asume que el manejo del Trailing Stop se basa en una caída fija.
const LSTATE = 'long'; 
// 💡 VALOR DEFINIDO POR EL USUARIO PARA EL TRAILING STOP (0.4%)
const TRAILING_STOP_PERCENTAGE = 0.4; 
// 💡 NUEVA CONSTANTE: Comisión de venta
const SELL_FEE_PERCENT = 0.001; // 0.1%


// =========================================================================
// FUNCIÓN HANDLER: LÓGICA DE RECUPERACIÓN DE CAPITAL Y CIERRE DE CICLO
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
		// 1. CÁLCULO DE CAPITAL Y GANANCIA (CORREGIDO PARA USAR AI Y FEE NETO)
		const { ac: totalBtcSold } = botStateObj.lStateData; // Ya no usamos ppc
        // 💡 MONTO TOTAL INVERTIDO REAL (incluye fees de compra)
        const totalUsdtSpent = botStateObj.lStateData.ai;
		
		// Usamos filledSize y priceAvg (o price) para asegurar precisión en la venta.
		const sellPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
		// Nota: Si la venta fue asumida (Error 50005), usamos totalBtcSold como filledSize para el cálculo.
		const filledSize = parseFloat(orderDetails.filled_volume || orderDetails.amount || totalBtcSold || 0);
		
		// MONTO DE VENTA BRUTO (antes de comisión)
		const totalUsdtRecoveredBRUTO = filledSize * sellPrice;
        
        // 🛑 CÁLCULO DE COMISIÓN DE VENTA Y PROFIT NETO
        const sellFeeUsdt = totalUsdtRecoveredBRUTO * SELL_FEE_PERCENT; 
        const totalUsdtRecoveredNETO = totalUsdtRecoveredBRUTO - sellFeeUsdt;
        
        // PROFIT REAL (Neto)
		const profitNETO = totalUsdtRecoveredNETO - totalUsdtSpent;
        
        // ------------------------------------------------------------------------
        // 💡 MODIFICACIÓN: PERSISTENCIA HISTÓRICA DE LA ORDEN DE VENTA
        // ------------------------------------------------------------------------
        const savedOrder = await saveExecutedOrder(orderDetails, LSTATE); // LSTATE es 'long'
        if (savedOrder) {
            log(`Orden de VENTA Long ID ${orderDetails.orderId || 'ASUMIDA'} guardada en el historial de Órdenes.`, 'debug');        }

        // ========================================================================
// 🟢 NUEVO BLOQUE: REGISTRO HISTÓRICO DEL CICLO DE TRADING
// ========================================================================
 
const cycleEndTime = new Date();
const cycleStartTime = botStateObj.lStateData.cycleStartTime;
let durationHours = null;

// Cálculo de Duración
if (cycleStartTime) {
    const durationMs = cycleEndTime.getTime() - cycleStartTime.getTime();
    durationHours = durationMs / (1000 * 60 * 60); // Convertir milisegundos a horas
}

// 🛑 Validar que el ciclo tenga un tiempo de inicio válido para evitar data inconsistente
if (cycleStartTime) { 
    const cycleData = {
        strategy: 'Long',
        cycleIndex: (botStateObj.lcycle || 0) + 1,
        symbol: config.symbol,
        
        startTime: cycleStartTime, // Usamos el tiempo válido
        endTime: cycleEndTime,
        durationHours: durationHours,
        
        initialInvestment: totalUsdtSpent,
        finalRecovery: totalUsdtRecoveredNETO,
        netProfit: profitNETO,
        profitPercentage: (profitNETO / totalUsdtSpent) * 100,
        
        averagePPC: botStateObj.lStateData.ppc,
        finalSellPrice: sellPrice,
        orderCount: botStateObj.lStateData.orderCountInCycle,
        
        autobotId: botStateObj._id 
    };

    const savedCycle = await logSuccessfulCycle(cycleData);
    if (savedCycle) {
        log(`Resumen del ciclo Long ${cycleData.cycleIndex} guardado. Ganancia: ${profitNETO.toFixed(2)} USDT.`, 'success');
    } else {
        log(`ADVERTENCIA: Falló el registro del ciclo ${cycleData.cycleIndex} en la DB.`, 'warning');
    }
} else {
    // Si no hay StartTime, solo registramos la ganancia y continuamos.
    log('ADVERTENCIA: cycleStartTime faltante. No se pudo registrar el ciclo en el historial.', 'warning');
}
// ========================================================================
// 🟢 FIN DEL BLOQUE DE REGISTRO
// ========================================================================

		// 2. RECUPERACIÓN DE CAPITAL OPERATIVO Y GANANCIA (Campos de Nivel Superior)
		// Sumamos el monto NETO total de USDT recuperado
		const newLBalance = botStateObj.lbalance + totalUsdtRecoveredNETO;
		
		// --- 2a. UPDATE DE ESTADO GENERAL (Punto 1 de Persistencia) ---
		await updateGeneralBotState({
			lbalance: newLBalance,
			// ✅ CORRECCIÓN: Usamos el profit NETO
			total_profit: (botStateObj.total_profit || 0) + profitNETO, // 💡 CAMPO DE BENEFICIO ACUMULADO NETO
			
			// 🎯 RESETEO DE DATOS DE ESTADO GENERAL Y CONTADORES
			ltprice: 0,
            lsprice: 0,
			lcoverage: 0,
			lnorder: 0,
			lcycle: (botStateObj.lcycle || 0) + 1 // ¡Incrementar el contador de ciclo!
		});

		log(`Cierre de Ciclo Long Exitoso! Ganancia NETA: ${profitNETO.toFixed(2)} USDT. Comisión de Venta deducida: ${sellFeeUsdt.toFixed(5)} USDT.`, 'success');
		log(`LBalance actualizado. Capital operativo disponible: ${newLBalance.toFixed(2)} USDT.`, 'info');

		// 3. RESETEO DE DATOS DE CICLO ESPECÍFICOS (lStateData)
		const resetLStateData = {
			ac: 0, ppc: 0, ai: 0, // 🛑 Resetear AI a 0
			orderCountInCycle: 0, 
			lastOrder: null, // <--- ESTO ES CRÍTICO
			pm: 0, pc: 0, pv: 0,
            // 🛑 NUEVOS CAMPOS A RESETEAR AL CIERRE DEL CICLO
            lastExecutionPrice: 0,
            nextCoveragePrice: 0,
            requiredCoverageAmount: 0,
            cycleStartTime: null // 💡 LIMPIAR EL START TIME
		}
		// --- 3a. UPDATE DE LSTATEDATA (Punto 2 de Persistencia - CRÍTICO) ---
		await updateLStateData(resetLStateData);

		// 4. TRANSICIÓN DE ESTADO (LÓGICA CRÍTICA DE REINICIO)
        if (config.long.stopAtCycle) {
            // Lógica 1: Si stopAtCycle es TRUE, el bot se DETIENE.
            log('Configuración: stopAtCycle activado. Bot Long se detendrá.', 'info');
            await updateBotState('STOPPED', LSTATE);
        } else {
            // Lógica 2: Si stopAtCycle es FALSE, el bot REINICIA INMEDIATAMENTE.
            
            log('Configuración: stopAtCycle desactivado. Transicionando a BUYING para iniciar la nueva compra.', 'info');
            
            // 🎯 FORZAMOS LA TRANSICIÓN AL ESTADO CORRECTO
            await updateBotState('BUYING', LSTATE);
        }

	} catch (error) {
		// ⚠️ BLOQUE DE RECUPERACIÓN AUTÓNOMA (Sustituye 'ERROR')
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
	const { botState, currentPrice, config, creds, log, updateLStateData, updateBotState, updateGeneralBotState } = dependencies;
	
	// =================================================================
	// === [ BLOQUE CRÍTICO DE RECUPERACIÓN DE SERVIDOR ] ================
	// =================================================================
    // 🛑 Nota: El Consolidator para la VENTA NO existe, por lo que esta lógica
    // de recuperación aquí es CRÍTICA. Mantenemos el bloque.
	const lastOrder = botState.lStateData.lastOrder;
	const SYMBOL = config.symbol || 'BTC_USDT';

	if (lastOrder && lastOrder.order_id && lastOrder.side === 'sell') {
		log(`Recuperación: Orden de venta pendiente con ID ${lastOrder.order_id} detectada en DB. Consultando BitMart...`, 'warning');

		try {
			// 1. Consultar el estado real de la orden en BitMart
			// 🛑 CORRECCIÓN: getOrderDetail necesita creds explícitamente si no está en el service. Asumo que está en el service y no necesita creds.
			const orderDetails = await getOrderDetail(SYMBOL, lastOrder.order_id);

			// Verifica si la orden fue llenada, incluso si luego fue cancelada (parcial)
			const isOrderFilled = orderDetails && (orderDetails.state === 'filled' || 
				(orderDetails.state === 'partially_canceled' && parseFloat(orderDetails.filled_volume || 0) > 0));

			if (isOrderFilled) {
				// Caso A: ORDEN LLENADA (Ejecución Exitosa después del reinicio)
				log(`Recuperación exitosa: La orden ID ${lastOrder.order_id} se completó durante el tiempo de inactividad.`, 'success');
				
				// Las dependencias necesarias para handleSuccessfulSell
				const handlerDependencies = { config, log, updateBotState, updateLStateData, updateGeneralBotState };
				
				// 2. Procesar la venta exitosa (cierra ciclo, recupera capital, resetea estado)
				await handleSuccessfulSell(botState, orderDetails, handlerDependencies); 
				
				return; // Finaliza la ejecución, el ciclo se ha cerrado.

			} else if (orderDetails && (orderDetails.state === 'new' || orderDetails.state === 'partially_filled')) {
				// Caso B: ORDEN AÚN ACTIVA (Esperar)
				log(`Recuperación: La orden ID ${lastOrder.order_id} sigue ${orderDetails.state} en BitMart. Esperando ejecución.`, 'info');
				return; // Detenemos la ejecución.

			} else {
				// Caso C: ORDEN CANCELADA, FALLIDA o NO ENCONTRADA (y no se llenó)
				log(`La orden ID ${lastOrder.order_id} no está activa ni completada. Asumiendo fallo y permitiendo una nueva venta. Estado: ${orderDetails ? orderDetails.state : 'No Encontrada'}`, 'error');
				
				// 2. Limpiar lastOrder para liberar el ciclo SELLING.
				await updateLStateData({ 'lastOrder': null });
				
				// 3. Continuar la ejecución del código para intentar colocar la orden de venta de nuevo.
			}
		} catch (error) {
		// 🛑 NUEVO MANEJO DEL ERROR 50005 🛑
		if (error.message.includes('50005')) {
			log(`Advertencia: Orden ${lastOrder.order_id} desapareció del historial reciente (Error 50005). Asumiendo llenado instantáneo y forzando cierre de ciclo.`, 'warning');
			
			// 1. Limpieza inmediata para evitar la doble ejecución en el siguiente ciclo.
			await updateLStateData({ 'lastOrder': null }); 
			
			// 2. Ejecutar el handler de éxito para cerrar el ciclo
			const handlerDependencies = { config, log, updateBotState, updateLStateData, updateGeneralBotState }; // Creds ya no son necesarios
			await handleSuccessfulSell(botState, { priceAvg: 0, filled_volume: botState.lStateData.ac, orderId: lastOrder.order_id, side: 'sell' }, handlerDependencies); // 💡 PASAR DATOS MÍNIMOS DE LA ORDEN ASUMIDA
			
			return; // Finaliza la ejecución para el siguiente ciclo.
		}

			log(`Error al consultar orden en BitMart durante la recuperación: ${error.message}`, 'error');
			return; // Para otros errores (red, autenticación), detenemos la ejecución para reintentar de forma segura.
		}
	}
	// =================================================================
	// === [ FIN DEL BLOQUE DE RECUPERACIÓN ] ============================
	// =================================================================
	
	// El código de abajo es la Lógica Normal de Trailing Stop

	// Se definen las dependencias que necesitará el handler al ejecutarse (al llenar la orden de venta)
	// 🛑 Nota: Ya no se pasa `handleSuccessfulSell` como argumento a `placeSellOrder` porque esa función fue simplificada.
	// La lógica de cierre debe hacerse en el Consolidator (si existiera) o en este bloque de recuperación.
	
	const { ac: acSelling, pm } = botState.lStateData;

	log("Estado Long: SELLING. Gestionando ventas...", 'info');
	
	// 💡 USAMOS EL VALOR FIJO DE 0.4% PARA EL TRAILING STOP, como se indica en la estrategia.
	const trailingStopPercent = TRAILING_STOP_PERCENTAGE / 100; // Convierte 0.4 a 0.004

	// 1. CÁLCULO DEL TRAILING STOP
	// El Precio Máximo (pm) solo debe subir
	const newPm = Math.max(pm || 0, currentPrice);
	// El Precio de Caída (pc) es el pm menos el porcentaje fijo de trailing stop
	const newPc = newPm * (1 - trailingStopPercent);

	// 2. ACTUALIZACIÓN Y PERSISTENCIA DE DATOS (PM y PC)
	// Solo persistir si el PM realmente subió.
	if (newPm > (pm || 0)) {
		log(`Trailing Stop: PM actualizado a ${newPm.toFixed(2)}. PC actualizado a ${newPc.toFixed(2)} (${TRAILING_STOP_PERCENTAGE}% caída).`, 'info');

	// Actualización atómica de PM y PC
	await updateLStateData({ pm: newPm, pc: newPc });
        // 💡 CAMBIO CRÍTICO: Actualizar lsprice con el mismo valor que newPc
        await updateGeneralBotState({ lsprice: newPc });
        log(`lsprice actualizado al valor de PC: ${newPc.toFixed(2)}.`, 'info');
	} else {
		log(`Esperando condiciones para la venta. Precio actual: ${currentPrice.toFixed(2)}, PM: ${newPm.toFixed(2)}, PC: ${newPc.toFixed(2)}`, 'info');
	}
	
	// 3. CONDICIÓN DE VENTA Y LIQUIDACIÓN
	// CRÍTICO: Aseguramos que el monto a vender sea igual o mayor al mínimo.
	if (acSelling >= MIN_SELL_AMOUNT_BTC && !lastOrder) {
	if (currentPrice <= newPc) {
		log(`Condiciones de venta por Trailing Stop alcanzadas. Colocando orden de venta a mercado para liquidar ${acSelling.toFixed(8)} BTC.`, 'success');
		
		// 🛑 BLOQUE TRY/CATCH AÑADIDO PARA MANEJAR FALLAS CRÍTICAS DE API
    try {
        await placeSellOrder(config, botState, acSelling, log); 
        // Si tiene éxito, placeSellOrder ya bloqueó el ciclo con lastOrder.
    } catch (error) {
        log(`Error CRÍTICO al colocar la orden de venta: ${error.message}`, 'error');
        
        // 🚨 SI FALLA POR BALANCE INSUFICIENTE (Error que produce el bucle):
        if (error.message.includes('Balance not enough')) {
            // 🛑 Transicionar a un estado de bloqueo o advertencia, p. ej., 'NO_COVERAGE'.
            // Esto detiene el bucle forzando la lógica a evaluar otra cosa.
            log('Fallo de VENTA por Balance/Activos insuficientes. Transicionando a NO_COVERAGE para detener el bucle.', 'warning');
            await updateBotState('NO_COVERAGE', LSTATE);
            
            // Opcional: Podrías limpiar lastOrder si el bot asume que el activo no existe:
            // await updateLStateData({ 'lastOrder': null }); 
        } 
        // Para otros errores, dejamos que el ciclo se detenga y reintente.
        
        return; // Salimos de la ejecución del run()
    }
}

module.exports = { 
	run, 
	handleSuccessfulSell // Exportado para que orderManager.js pueda usarlo.
};