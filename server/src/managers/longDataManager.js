// BSB/server/src/managers/longDataManager.js

const Autobot = require('../../models/Autobot');
// 🛑 IMPORTACIÓN DE LSellingHandler ELIMINADA. La lógica se mueve aquí.
const { saveExecutedOrder } = require('../../services/orderPersistenceService');
// Nuevas importaciones necesarias para la función movida
const { logSuccessfulCycle } = require('../../services/cycleLogService');

const LSTATE = 'long';
const SELL_FEE_PERCENT = 0.001; // 0.1% (Constante movida de LSelling.js)

/**
 * Maneja una compra exitosa (total o parcial) y actualiza la posición (PPC, AC, AI).
 */
async function handleSuccessfulBuy(botState, orderDetails, log) {
    // --- 1. EXTRACCIÓN Y CÁLCULO DE COSTO REAL ---
    // ... (Cuerpo de handleSuccessfulBuy se mantiene IDÉNTICO)
    const executedQty = parseFloat(orderDetails.filledSize || 0);
    const executedPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
    const baseExecutedCost = executedQty * executedPrice;
    const executedFee = parseFloat(orderDetails.fee || 0);
    const executedNotional = parseFloat(orderDetails.notional || 0);
    const actualExecutedCost = (executedNotional > 0 ? executedNotional : baseExecutedCost) + executedFee;

    if (executedQty <= 0 || executedPrice <= 0) {
        log('Error de procesamiento de compra: handleSuccessfulBuy llamado con ejecución, precio o costo cero. Limpiando lastOrder.', 'error');
        await Autobot.findOneAndUpdate({}, { $set: { 'lStateData.lastOrder': null } });
        return;
    }

    // --- 2. CÁLCULO DEL NUEVO PRECIO PROMEDIO DE COMPRA (PPC) y AC ---
    const isFirstOrder = (botState.lStateData.orderCountInCycle || 0) === 0;
    const currentTotalQty = isFirstOrder ? 0 : parseFloat(botState.lStateData.ac || 0);
    const currentAI = isFirstOrder ? 0 : parseFloat(botState.lStateData.ai || 0);
    const newTotalQty = currentTotalQty + executedQty;
    const newAI = currentAI + actualExecutedCost;

    let newPPC = 0;

    if (newTotalQty > 0) {
        newPPC = newAI / newTotalQty;
        if (isNaN(newPPC) || newPPC === Infinity) newPPC = currentAI;
    }

    // --- 3. GESTIÓN DEL CAPITAL RESTANTE (LBalance y Refund) ---
    const intendedUsdtCostBlocked = parseFloat(botState.lStateData.lastOrder?.usdt_cost_real || 0);
    const refundAmount = intendedUsdtCostBlocked - actualExecutedCost;
    let finalLBalance = parseFloat(botState.lbalance || 0);

    if (refundAmount > 0.01) {
        finalLBalance = finalLBalance + refundAmount;
        log(`Devolviendo ${refundAmount.toFixed(2)} USDT al LBalance. Nuevo balance: ${finalLBalance.toFixed(2)} USDT.`, 'info');
    }

    // ------------------------------------------------------------------------
    // 💡 CÁLCULO DE TARGETS DE COBERTURA Y VENTA
    // ------------------------------------------------------------------------
    const { price_var, size_var, purchaseUsdt, profit_percent } = botState.config.long;

    const coveragePercentage = price_var / 100;
    const newNextCoveragePrice = executedPrice * (1 - coveragePercentage);

    const lastOrderUsdtAmount = parseFloat(botState.lStateData.lastOrder?.usdt_amount || purchaseUsdt);
    const sizeVariation = size_var / 100;
    const newRequiredCoverageAmount = lastOrderUsdtAmount * (1 + sizeVariation);

    const profitPercentage = profit_percent / 100;
    const newLTPrice = newPPC * (1 + profitPercentage);

    log(`Targets calculados. Sell Price: ${newLTPrice.toFixed(2)}, Next Price: ${newNextCoveragePrice.toFixed(2)}, Next Amount: ${newRequiredCoverageAmount.toFixed(2)} USDT.`, 'info');

    // --- 4. ACTUALIZACIÓN ATÓMICA DE ESTADO EN LA BASE DE DATOS (CRÍTICO) ---
    const SYMBOL = botState.config.symbol || 'BTC_USDT';
    await saveExecutedOrder({ ...orderDetails, symbol: SYMBOL }, 'long');

    const atomicUpdate = {
        $set: {
            'lbalance': finalLBalance,
            'ltprice': newLTPrice,
            'lStateData.ac': newTotalQty,
            'lStateData.ai': newAI,
            'lStateData.ppc': newPPC,
            'lStateData.lastExecutionPrice': executedPrice,
            'lStateData.nextCoveragePrice': newNextCoveragePrice,
            'lStateData.requiredCoverageAmount': newRequiredCoverageAmount,
            'lStateData.lastOrder': null,
            'lStateData.lNOrderMax': (botState.lStateData.lNOrderMax || 0) + 1,
            ...(isFirstOrder && {
                'lStateData.cycleStartTime': new Date()
            }),
        },
        $inc: {
            'lStateData.orderCountInCycle': 1,
            ...(isFirstOrder && { 'lcycle': 1 }),
        }
    };

    await Autobot.findOneAndUpdate({}, atomicUpdate);

    log(`[LONG] Transición completa. Nuevo PPC: ${newPPC.toFixed(2)}, Qty Total (AC): ${newTotalQty.toFixed(8)}.`, 'success');
}

// =========================================================================
// FUNCIÓN HANDLER: LÓGICA DE RECUPERACIÓN DE CAPITAL Y CIERRE DE CICLO (MOVIDA DE LSelling.js)
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
		// 🟢 BLOQUE: REGISTRO HISTÓRICO DEL CICLO DE TRADING
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

module.exports = {
    handleSuccessfulBuy,
    handleSuccessfulSell
};