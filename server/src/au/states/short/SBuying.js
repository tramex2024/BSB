// BSB/server/src/au/short/states/SBuying.js (ESPEJO DE LSelling.js)

const { placeShortBuyOrder } = require('../../managers/shortOrderManager');

const MIN_CLOSE_AMOUNT_BTC = 0.00005;
const SSTATE = 'short';
const TRAILING_STOP_PERCENTAGE = 0.4;

/**
 * GESTIÓN DEL CIERRE DE SHORT (Take Profit con Trailing Stop)
 */
async function run(dependencies) {
	const { botState, currentPrice, config, log, updateSStateData, updateBotState, updateGeneralBotState } = dependencies;
	
	const lastOrder = botState.sStateData.lastOrder; 
	const { ac: acBuying, pm } = botState.sStateData; // En Short, PM será el Precio Mínimo alcanzado

	log("Estado Short: BUYING. Gestionando recompra y Trailing Stop descendente...", 'info');
	
	// NOTA: El monitoreo y consolidación de la orden de recompra
	// lo realiza el módulo ShortBuyConsolidator en autobotLogic.js.

	// =================================================================
	// === [ Lógica de Trailing Stop para SHORT (Hacia abajo) ] ========
	// =================================================================

	const trailingStopPercent = TRAILING_STOP_PERCENTAGE / 100;

	// CÁLCULO DEL TRAILING STOP INVERSO
	// En Short, queremos que el PM sea el precio MÁS BAJO (Minimum)
	const currentPm = pm || currentPrice;
	const newPm = Math.min(currentPm, currentPrice); 
	
	// El PC (Precio de Cierre) estará un 0.4% POR ENCIMA del mínimo alcanzado
	const newPc = newPm * (1 + trailingStopPercent);

	// ACTUALIZACIÓN DE PM y PC (Si el precio cae, bajamos el profit target)
	if (newPm < currentPm || !pm) {
		log(`Trailing Short: Mínimo (PM) actualizado a ${newPm.toFixed(2)}. Recompra (PC) ajustada a ${newPc.toFixed(2)} (+${TRAILING_STOP_PERCENTAGE}% rebote).`, 'info');

		await updateSStateData({ pm: newPm, pc: newPc });
		await updateGeneralBotState({ ssprice: newPc }); // ssprice es el indicador visual en el dashboard
	} else {
		log(`Esperando suelo. Precio actual: ${currentPrice.toFixed(2)}, Mínimo: ${newPm.toFixed(2)}, Recompra si sube a: ${newPc.toFixed(2)}`, 'info');
	}
	
	// CONDICIÓN DE RECOMPRA Y CIERRE (Solo si NO hay una orden pendiente)
	if (acBuying >= MIN_CLOSE_AMOUNT_BTC && !lastOrder) {
		// Si el precio rebota y toca el PC (que está arriba del mínimo)
		if (currentPrice >= newPc) {
			log(`Condiciones de cierre Short alcanzadas. Recomprando ${acBuying.toFixed(8)} BTC para liquidar posición.`, 'success');
			
			try {
				// placeShortBuyOrder coloca la orden de compra y bloquea lastOrder
				await placeShortBuyOrder(config, botState, acBuying, log);    
			} catch (error) {
				log(`Error CRÍTICO al cerrar Short: ${error.message}`, 'error');
				
				if (error.message.includes('Balance not enough') || error.message.includes('volume too small')) {
					log('Error CRÍTICO de ejecución. Transicionando a NO_COVERAGE para revisión manual.', 'error');
					await updateBotState('NO_COVERAGE', SSTATE);    
					return;
				}    
				return; 
			}
			return;
		}
	}
}

module.exports = { run };