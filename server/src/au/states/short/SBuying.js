// BSB/server/src/states/short/SBuying.js (Espejo de LSelling.js)

const { placeBuyToCloseShort } = require('../../managers/shortOrderManager'); // 💡 Nueva función de orden Short
const { getOrderDetail } = require('../../../../services/bitmartService'); 

// 💡 Se asume que esta constante se moverá a tradeConstants.js
const MIN_BUY_AMOUNT_USDT = 5.00; 

// Se asume que el manejo del Trailing Stop se basa en una caída fija.
const S_STATE = 'short'; 
const TRAILING_STOP_PERCENTAGE = 0.4; 
const BUY_FEE_PERCENT = 0.001; // 0.1%


// =========================================================================
// FUNCIÓN HANDLER: LÓGICA DE RECUPERACIÓN DE CAPITAL Y CIERRE DE CICLO SHORT
// =========================================================================

/**
 * Lógica para manejar una orden de COMPRA exitosa (cierre de ciclo Short).
 * @param {object} botStateObj - Estado del bot antes de la compra de cierre.
 * @param {object} orderDetails - Detalles de la orden de BitMart completada.
 * @param {object} dependencies - Dependencias inyectadas.
 */
async function handleSuccessfulBuyToCloseShort(botStateObj, orderDetails, dependencies) {
	const { config, log, updateBotState, updateSStateData, updateGeneralBotState } = dependencies;
	
	try {
		// 1. CÁLCULO DE CAPITAL Y GANANCIA (CORREGIDO PARA USAR AC y AI)
		const { ac: totalBtcSoldShort } = botStateObj.sStateData; // Cantidad BTC vendida en corto
        // 💡 MONTO TOTAL USDT RECIBIDO REAL (incluye fees de venta)
        const totalUsdtReceived = botStateObj.sStateData.ai; 
		
		// Usamos filledSize y priceAvg (o price) para asegurar precisión en la compra de cierre.
		const buyPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
		// Nota: Si la compra fue asumida (Error 50005), usamos totalBtcSoldShort como filledSize.
		const filledSizeBtc = parseFloat(orderDetails.filled_volume || orderDetails.amount || totalBtcSoldShort || 0);
		
		// MONTO DE COMPRA BRUTO (antes de comisión)
		const totalUsdtSpentBRUTO = filledSizeBtc * buyPrice;
        
        // 🛑 CÁLCULO DE COMISIÓN DE COMPRA Y PROFIT NETO
        const buyFeeUsdt = totalUsdtSpentBRUTO * BUY_FEE_PERCENT; 
        const totalUsdtSpentNETO = totalUsdtSpentBRUTO + buyFeeUsdt; // El costo neto incluye el fee de compra
        
        // PROFIT REAL (Neto): Lo que se recibió (AI) - Lo que costó cerrar (NETO)
		const profitNETO = totalUsdtReceived - totalUsdtSpentNETO;
		
		// 2. RECUPERACIÓN DE CAPITAL OPERATIVO Y GANANCIA (Campos de Nivel Superior)
		
		// El sbalance (capital BTC) se restablece al valor inicial, ya que la posición BTC se cierra.
        // Asumimos que la lógica de Short opera sobre un capital fijo de BTC.
        const initialSBalance = parseFloat(config.short.amountBtc || 0);
        
        // --- 2a. UPDATE DE ESTADO GENERAL (Punto 1 de Persistencia) ---
		await updateGeneralBotState({
            sbalance: initialSBalance, // 💡 Restaurar el saldo BTC asignado
			// ✅ CORRECCIÓN: Usamos el profit NETO
			total_profit: (botStateObj.total_profit || 0) + profitNETO, // 💡 CAMPO DE BENEFICIO ACUMULADO NETO
			
			// 🎯 RESETEO DE DATOS DE ESTADO GENERAL Y CONTADORES
			stprice: 0,
			scoverage: 0,
			snorder: 0,
			scycle: (botStateObj.scycle || 0) + 1 // ¡Incrementar el contador de ciclo!
		});

		log(`Cierre de Ciclo Short Exitoso! Ganancia NETA: ${profitNETO.toFixed(2)} USDT. Comisión de Compra deducida: ${buyFeeUsdt.toFixed(5)} USDT.`, 'success');
		log(`SBalance BTC restaurado a ${initialSBalance.toFixed(8)} BTC.`, 'info');

		// 3. RESETEO DE DATOS DE CICLO ESPECÍFICOS (sStateData)
		const resetSStateData = {
			ac: 0, ppc: 0, ai: 0, // 🛑 Resetear AC y AI a 0
			orderCountInCycle: 0, 
			lastOrder: null, 
			pm: 0, pc: 0, pv: 0
		}
		// --- 3a. UPDATE DE SSTATEDATA (Punto 2 de Persistencia - CRÍTICO) ---
		await updateSStateData(resetSStateData);

		// 4. TRANSICIÓN DE ESTADO (LÓGICA CRÍTICA DE REINICIO)
        if (config.short.stopAtCycle) {
            log('Configuración: stopAtCycle activado. Bot Short se detendrá.', 'info');
            await updateBotState('STOPPED', S_STATE);
        } else {
            log('Configuración: stopAtCycle desactivado. Transicionando a SELLING para iniciar la nueva orden Short.', 'info');
            
            // 🎯 FORZAMOS LA TRANSICIÓN AL ESTADO CORRECTO (SSelling)
            await updateBotState('SELLING', S_STATE);
        }

	} catch (error) {
		log(`CRITICAL PERSISTENCE ERROR: Falló el reseteo del estado tras la compra exitosa/asumida. Causa: ${error.message}`, 'error');
		log('Intentando limpieza de lastOrder y permitiendo reintento en el próximo ciclo.', 'warning');
		
		try {
			await updateSStateData({ 'lastOrder': null });
		} catch (dbError) {
			 log(`FALLA DE RECUPERACIÓN: No se pudo limpiar lastOrder. Revise la conexión/estado de la DB.`, 'error');
		}
	}
}

// =========================================================================
// FUNCIÓN PRINCIPAL DE GESTIÓN DEL ESTADO BUYING (CIERRE SHORT)
// =========================================================================

async function run(dependencies) {
	const { botState, currentPrice, config, creds, log, updateSStateData, updateBotState, updateGeneralBotState } = dependencies;
	
	// =================================================================
	// === [ BLOQUE CRÍTICO DE RECUPERACIÓN DE SERVIDOR ] ================
	// =================================================================
	const lastOrder = botState.sStateData.lastOrder;
	const SYMBOL = config.symbol || 'BTC_USDT';

	if (lastOrder && lastOrder.order_id && lastOrder.side === 'buy') { // 🛑 Espejo: Buscamos una orden de compra pendiente
		log(`Recuperación: Orden de compra de cierre pendiente con ID ${lastOrder.order_id} detectada en DB. Consultando BitMart...`, 'warning');

		try {
			const orderDetails = await getOrderDetail(SYMBOL, lastOrder.order_id);

			const isOrderFilled = orderDetails && (orderDetails.state === 'filled' || 
				(orderDetails.state === 'partially_canceled' && parseFloat(orderDetails.filled_volume || 0) > 0));

			if (isOrderFilled) {
				log(`Recuperación exitosa: La orden ID ${lastOrder.order_id} se completó durante el tiempo de inactividad.`, 'success');
				
				const handlerDependencies = { config, creds, log, updateBotState, updateSStateData, updateGeneralBotState };
				await handleSuccessfulBuyToCloseShort(botState, orderDetails, handlerDependencies); // 🛑 LLAMADA AL HANDLER SHORT
				
				return; 

			} else if (orderDetails && (orderDetails.state === 'new' || orderDetails.state === 'partially_filled')) {
				log(`Recuperación: La orden ID ${lastOrder.order_id} sigue ${orderDetails.state} en BitMart. Esperando ejecución.`, 'info');
				return; 

			} else {
				log(`La orden ID ${lastOrder.order_id} no está activa ni completada. Asumiendo fallo y permitiendo una nueva compra de cierre. Estado: ${orderDetails ? orderDetails.state : 'No Encontrada'}`, 'error');
				
				await updateSStateData({ 'lastOrder': null });
			}
		} catch (error) {
		// 🛑 NUEVO MANEJO DEL ERROR 50005 🛑
		if (error.message.includes('50005')) {
			log(`Advertencia: Orden ${lastOrder.order_id} desapareció del historial reciente (Error 50005). Asumiendo llenado instantáneo y forzando cierre de ciclo.`, 'warning');
			
			await updateSStateData({ 'lastOrder': null }); 
			
			const handlerDependencies = { config, creds, log, updateBotState, updateSStateData, updateGeneralBotState };
			await handleSuccessfulBuyToCloseShort(botState, { priceAvg: 0, filled_volume: botState.sStateData.ac }, handlerDependencies); // 🛑 LLAMADA AL HANDLER SHORT
			
			return; 
		}

			log(`Error al consultar orden en BitMart durante la recuperación: ${error.message}`, 'error');
			return; 
		}
	}
	// =================================================================
	// === [ FIN DEL BLOQUE DE RECUPERACIÓN ] ============================
	// =================================================================
	
	// Lógica Normal de Trailing Stop
	const handlerDependencies = { config, creds, log, updateBotState, updateSStateData, updateGeneralBotState, botState };

	const { ac: acSelling, pm, pc } = botState.sStateData;

	log("Estado Short: BUYING (Cierre). Gestionando Trailing Stop...", 'info');
	
	const trailingStopPercent = TRAILING_STOP_PERCENTAGE / 100;

	// 1. CÁLCULO DEL TRAILING STOP
	// El Precio Mínimo (pm) solo debe caer
	const newPm = Math.min(pm > 0 ? pm : Infinity, currentPrice); // 🛑 INVERSIÓN: Usamos Math.min
	// El Precio de Venta (pc) es el pm más el porcentaje fijo de trailing stop
	const newPc = newPm * (1 + trailingStopPercent); // 🛑 INVERSIÓN: Sumamos el porcentaje
	
	// 2. ACTUALIZACIÓN Y PERSISTENCIA DE DATOS (PM y PC)
	// Solo persistir si el PM realmente cayó (o se inicializó en el primer ciclo)
	if (newPm < (pm || Infinity) || pm === 0) { 
		log(`Trailing Stop Short: PM actualizado a ${newPm.toFixed(2)}. PC actualizado a ${newPc.toFixed(2)} (${TRAILING_STOP_PERCENTAGE}% subida).`, 'info');

		// Actualización atómica de PM y PC
		await updateSStateData({ pm: newPm, pc: newPc });
	} else {
		log(`Esperando condiciones para el cierre Short. Precio actual: ${currentPrice.toFixed(2)}, PM: ${newPm.toFixed(2)}, PC: ${newPc.toFixed(2)}`, 'info');
	}
	
	// 3. CONDICIÓN DE COMPRA Y LIQUIDACIÓN
	// CRÍTICO: Aseguramos que el monto a comprar sea suficiente (en BTC).
	if (acSelling >= MIN_SELL_AMOUNT_BTC && !lastOrder) { // Se usa el mismo mínimo de BTC para cerrar que para abrir
        // 🛑 CONDICIÓN INVERTIDA: El precio debe SUBIR al Precio de Cierre (PC)
	    if (currentPrice >= newPc) {
            log(`Condiciones de cierre Short por Trailing Stop alcanzadas. Colocando orden de COMPRA a mercado para liquidar ${acSelling.toFixed(8)} BTC.`, 'success');
            
            // LLAMADA: placeBuyToCloseShort coloca la orden y luego llama a handleSuccessfulBuyToCloseShort.
            await placeBuyToCloseShort(config, creds, acSelling, log, handleSuccessfulBuyToCloseShort, botState, handlerDependencies);

        }
    } else if (acSelling > 0 && acSelling < MIN_SELL_AMOUNT_BTC) {
        log(`Advertencia: La cantidad acumulada para cerrar (${acSelling.toFixed(8)} BTC) es menor al mínimo de la plataforma. Cierre bloqueado.`, 'warning');
    } 			
}

module.exports = { 
	run, 
	handleSuccessfulBuyToCloseShort // Exportado para que orderManager.js pueda usarlo.
};