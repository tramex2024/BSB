// BSB/server/src/au/states/long/LSelling.js (ETAPA 2: Con Consolidator de Venta)

const { placeSellOrder } = require('../../managers/longOrderManager');
// Ya no necesitamos handleSuccessfulSell, getOrderDetail, getRecentOrders, etc., aquí.

const MIN_SELL_AMOUNT_BTC = 0.00005;
const LSTATE = 'long';
const TRAILING_STOP_PERCENTAGE = 0.4;

// =========================================================================
// FUNCIÓN PRINCIPAL DE GESTIÓN DEL ESTADO SELLING
// =========================================================================

async function run(dependencies) {
	const { botState, currentPrice, config, log, updateLStateData, updateBotState, updateGeneralBotState } = dependencies;
	
	const lastOrder = botState.lStateData.lastOrder; // Se usa aquí para el bloqueo implícito.
	const { ac: acSelling, pm } = botState.lStateData;

	log("Estado Long: SELLING. Gestionando ventas y Trailing Stop...", 'info');
	
	// =================================================================
	// === [ 1. ELIMINACIÓN DEL BLOQUE DE CONSOLIDACIÓN DUPLICADO ] ====
	// =================================================================
    // NOTA: El monitoreo y consolidación de la orden de venta (las antiguas líneas 18-97)
    // ahora lo realiza el módulo LongSellConsolidator en autobotLogic.js.
	
	// El ciclo del bot se bloqueará en 'autobotLogic.js' si lastOrder está presente.
    // Si lastOrder es null, continuamos con la lógica de colocación.
	
	// =================================================================
	// === [ 2. Lógica Normal de Trailing Stop y Colocación ] ============
	// =================================================================

	const trailingStopPercent = TRAILING_STOP_PERCENTAGE / 100;

	// CÁLCULO DEL TRAILING STOP
	const newPm = Math.max(pm || 0, currentPrice);
	const newPc = newPm * (1 - trailingStopPercent);

	// ACTUALIZACIÓN Y PERSISTENCIA DE DATOS (PM y PC)
	if (newPm > (pm || 0)) {
		log(`Trailing Stop: PM actualizado a ${newPm.toFixed(2)}. PC actualizado a ${newPc.toFixed(2)} (${TRAILING_STOP_PERCENTAGE}% caída).`, 'info');

		await updateLStateData({ pm: newPm, pc: newPc });
        await updateGeneralBotState({ lsprice: newPc });
        log(`lsprice actualizado al valor de PC: ${newPc.toFixed(2)}.`, 'info');
	} else {
		log(`Esperando condiciones para la venta. Precio actual: ${currentPrice.toFixed(2)}, PM: ${newPm.toFixed(2)}, PC: ${newPc.toFixed(2)}`, 'info');
	}
	
	// CONDICIÓN DE VENTA Y LIQUIDACIÓN (Solo si NO hay una orden pendiente)
	if (acSelling >= MIN_SELL_AMOUNT_BTC && !lastOrder) { // 🎯 CRÍTICO: El bloqueo !lastOrder es clave
		if (currentPrice <= newPc) {
			log(`Condiciones de venta por Trailing Stop alcanzadas. Colocando orden de venta a mercado para liquidar ${acSelling.toFixed(8)} BTC.`, 'success');
			
        	try {
                // placeSellOrder contiene el BLOQUEO ATÓMICO (Guarda lastOrder)
            	await placeSellOrder(config, botState, acSelling, log);    
        	} catch (error) {
            	log(`Error CRÍTICO al colocar la orden de venta: ${error.message}`, 'error');
            	
            	// 🚨 Si falla la colocación (por balance/volumen), forzamos a NO_COVERAGE.
            	if (error.message.includes('Balance not enough') || error.message.includes('volume too small')) {
                	log('Error CRÍTICO: El bot no puede vender el activo. MANTENIENDO AC, deteniendo el trading y transicionando a NO_COVERAGE para investigación.', 'error');
                	await updateBotState('NO_COVERAGE', LSTATE);    
                	return;
            	}    
            	
            	return; // Si hay otro error (API down, etc.), detenemos la ejecución de este ciclo.
        	}
            // Después de la colocación exitosa, placeSellOrder ya actualizó lastOrder.
            // Retornamos para esperar la consolidación en el próximo ciclo.
            return;
		}
	}
}

module.exports = { run };