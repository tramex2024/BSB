// BSB/server/src/au/managers/longDataManager.js

const Autobot = require('../../../models/Autobot');
const { saveExecutedOrder } = require('../../../services/orderPersistenceService');
const { logSuccessfulCycle } = require('../../../services/cycleLogService');
// 🛑 IMPORTACIÓN CORREGIDA
const { calculateLongCoverage, parseNumber } = require('../../../autobotCalculations'); 

const LSTATE = 'long';
const SELL_FEE_PERCENT = 0.001; // 0.1%

/**
 * Maneja una compra exitosa (total o parcial) y actualiza la posición (PPC, AC, AI).
 */
async function handleSuccessfulBuy(botState, orderDetails, log) {
    // --- 1. EXTRACCIÓN Y CÁLCULO DE COSTO REAL ---
    const executedQty = parseFloat(orderDetails.filledSize || 0);
    const executedPrice = parseFloat(orderDetails.price_avg || orderDetails.priceAvg || orderDetails.price || 0);
    const baseExecutedCost = executedQty * executedPrice;
    const executedFee = parseFloat(orderDetails.fee || 0);
    const executedNotional = parseFloat(orderDetails.notional || 0);
    // Costo real pagado incluyendo fee
    const actualExecutedCost = baseExecutedCost;

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
    const newAI = currentAI + (executedQty * executedPrice);

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
    // 💡 CÁLCULO DE TARGETS DE COBERTURA, VENTA Y MÁXIMA COBERTURA RESTANTE
    // ------------------------------------------------------------------------
    const { price_var, size_var, purchaseUsdt, profit_percent } = botState.config.long;

    const priceVarDecimal = parseNumber(price_var) / 100;
    const sizeVarDecimal = parseNumber(size_var) / 100;

    const newNextCoveragePrice = executedPrice * (1 - priceVarDecimal);

    const lastOrderUsdtAmount = parseFloat(botState.lStateData.lastOrder?.usdt_amount || purchaseUsdt);
    const newRequiredCoverageAmount = lastOrderUsdtAmount * (1 + sizeVarDecimal);

    const profitPercentage = parseNumber(profit_percent) / 100;
    const newLTPrice = newPPC * (1 + profitPercentage);

    // 🛑 CÁLCULO DE MÁXIMA COBERTURA RESTANTE (lcoverage y lnorder)
    const { coveragePrice: newLCoverage, numberOfOrders: newLNOrder } = calculateLongCoverage(
        finalLBalance,      // Usamos el capital restante
        newPPC,             // Usamos el nuevo PPC como precio de referencia
        purchaseUsdt,       // Importe base de la primera orden
        priceVarDecimal,
        sizeVarDecimal
    );
    
    log(`Targets calculados. Sell Price: ${newLTPrice.toFixed(2)}, Next Price: ${newNextCoveragePrice.toFixed(2)}, Next Amount: ${newRequiredCoverageAmount.toFixed(2)} USDT.`, 'info');
    log(`Potencial de Cobertura restante: ${newLNOrder} órdenes, hasta precio: ${newLCoverage.toFixed(2)} USD.`, 'info');

    // --- 4. ACTUALIZACIÓN ATÓMICA DE ESTADO EN LA BASE DE DATOS (CRÍTICO) ---
    const SYMBOL = botState.config.symbol || 'BTC_USDT';
    await saveExecutedOrder({ ...orderDetails, symbol: SYMBOL }, 'long');

    const atomicUpdate = {
        $set: {
            // 🛑 CAMPOS GLOBALES ACTUALIZADOS CORRECTAMENTE
            'lbalance': finalLBalance,
            'ltprice': newLTPrice,
            'lcoverage': newLCoverage,
            'lnorder': newLNOrder, 

            // CAMPOS DE CICLO (lStateData)
            'lStateData.ac': newTotalQty,
            'lStateData.ai': newAI,
            'lStateData.ppc': newPPC,
            'lStateData.lastExecutionPrice': executedPrice,
            'lStateData.nextCoveragePrice': newNextCoveragePrice,
            'lStateData.requiredCoverageAmount': newRequiredCoverageAmount,
            'lStateData.lastOrder': null,
            // 'lStateData.lNOrderMax': (botState.lStateData.lNOrderMax || 0) + 1, // 🛑 ELIMINADO
            
            ...(isFirstOrder && {
                'lStateData.cycleStartTime': new Date()
            }),
        },
        $inc: {
            'lStateData.orderCountInCycle': isFirstOrder ? 1 : (botState.lStateData.orderCountInCycle + 1),            
        }
    };

    await Autobot.findOneAndUpdate({}, atomicUpdate);

    log(`[LONG] Compra Consolidada. Nuevo PPC: ${newPPC.toFixed(2)}, Qty Total (AC): ${newTotalQty.toFixed(8)}.`, 'success');
}

// =========================================================================
// FUNCIÓN HANDLER: LÓGICA DE RECUPERACIÓN DE CAPITAL Y CIERRE DE CICLO
// =========================================================================

/**
 * Lógica para manejar una orden de venta exitosa (cierre de ciclo Long).
 */
async function handleSuccessfulSell(botStateObj, orderDetails, dependencies) {
	// Aseguramos la extracción de todas las dependencias necesarias
	const { config, log, updateBotState, updateLStateData, updateGeneralBotState } = dependencies;
	
	try {
		// 1. CÁLCULO DE CAPITAL Y GANANCIA (NETO REAL)
		const totalUsdtSpent = botStateObj.lStateData.ai; // Lo que invertimos originalmente
		
		const sellPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
		const filledSize = parseFloat(orderDetails.filled_volume || orderDetails.filledSize || 0); 
		
		// 🚨 VALIDACIÓN CRÍTICA: Asegurar que hay datos reales antes de continuar
		if (filledSize <= 0 || sellPrice <= 0) {
			log('Error: La venta fue reportada como exitosa, pero filledSize o SellPrice es cero. Abortando registro de ciclo.', 'error');
			await updateLStateData({ 'lastOrder': null }); 
			throw new Error("Venta fallida o sin volumen llenado reportado."); 
		}

		// Cálculos de Venta
		const totalUsdtRecoveredBRUTO = filledSize * sellPrice;
		const sellFeeUsdt = totalUsdtRecoveredBRUTO * SELL_FEE_PERCENT;    
		const totalUsdtRecoveredNETO = totalUsdtRecoveredBRUTO - sellFeeUsdt;

		// Cálculo de comisión de Compra (0.1% estimado sobre el gasto inicial)
		const estimatedBuyFeeUsdt = totalUsdtSpent * 0.001; 

		// Ganancia Neta Real: Recuperado - Gastado - Comisión de compra
		const profitNETO = totalUsdtRecoveredNETO - totalUsdtSpent - estimatedBuyFeeUsdt;
		
		// Determinamos si la venta fue total (99% para cubrir polvos de BTC/fees)
		const isFullSell = filledSize >= (botStateObj.lStateData.ac * 0.99);

		// ------------------------------------------------------------------------
		// MODIFICACIÓN: PERSISTENCIA HISTÓRICA DE LA ORDEN DE VENTA (Reforzada)
		// ------------------------------------------------------------------------
		const SYMBOL = config.symbol || 'BTC_USDT';
		const orderToSave = {
			...orderDetails,
			orderTime: new Date(orderDetails.createTime || orderDetails.orderTime || Date.now()),
			symbol: orderDetails.symbol || SYMBOL,
			type: orderDetails.type || 'MARKET',
			side: 'sell' 
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
		
		// 🛑 RECALCULAR NUEVA COBERTURA INICIAL (Primeros targets después del reseteo)
		const { coveragePrice: newLCoverageReset, numberOfOrders: newLNOrderReset } = calculateLongCoverage(
			newLBalance,      
			sellPrice,        // Usamos el precio de venta como referencia
			config.long.purchaseUsdt,
			parseNumber(config.long.price_var) / 100,
			parseNumber(config.long.size_var) / 100
		);
		
		await updateGeneralBotState({
			lbalance: newLBalance,
			total_profit: (botStateObj.total_profit || 0) + profitNETO,
			ltprice: 0, 
			lsprice: 0, 
			lcoverage: newLCoverageReset,
			lnorder: newLNOrderReset,     
			// 🎯 ÚNICO INCREMENTO DE CICLO: Solo si la venta fue total
			lcycle: isFullSell ? (Number(botStateObj.lcycle || 0) + 1) : Number(botStateObj.lcycle || 0)
		});

		log(`Cierre de Ciclo Long Exitoso! Ganancia NETA (0.2% fee incl.): ${profitNETO.toFixed(2)} USDT.`, 'success');

		// 3. RESETEO DE DATOS DE CICLO ESPECÍFICOS (lStateData)
		// Calculamos si la venta fue prácticamente total (99% para cubrir comisiones)
let resetLStateData;

if (isFullSell) {
    // VENTA TOTAL: Limpiamos todo para el siguiente ciclo
    resetLStateData = {
        ac: 0, ppc: 0, ai: 0, orderCountInCycle: 0, lastOrder: null, pm: 0, pc: 0, 
        lastExecutionPrice: 0, nextCoveragePrice: 0, requiredCoverageAmount: 0,
        cycleStartTime: null
    };
} else {
    // VENTA PARCIAL: Solo restamos lo vendido y mantenemos el PPC para seguir vendiendo
    const remainingAc = Math.max(0, botStateObj.lStateData.ac - filledSize);
    resetLStateData = {
        ac: remainingAc,
        lastOrder: null,
        // Mantener ppc y ai para que el bot sepa a qué precio debe vender el resto
        ppc: botStateObj.lStateData.ppc, 
        ai: (botStateObj.lStateData.ppc * remainingAc)
    };
}
		await updateLStateData(resetLStateData);

		// 4. TRANSICIÓN DE ESTADO
        if (config.long.stopAtCycle) {
            log('Configuración: stopAtCycle activado. Bot Long se detendrá.', 'info');
            await updateBotState('STOPPED', LSTATE);
        } else {
            log('Configuración: stopAtCycle desactivado. Transicionando a BUYING para iniciar la nueva compra.', 'info');
            if (isFullSell) {
    // Si vendió todo, puede ir a buscar nuevas compras
    await updateBotState('BUYING', LSTATE);
} else {
    // Si quedó saldo, debe quedarse en SELLING para intentar liquidar el resto
    await updateBotState('SELLING', LSTATE);
}
        }

	} catch (error) {
        // Si la validación falla (filledSize <= 0) llegamos aquí
        log(`CRITICAL PERSISTENCE ERROR: Falló el reseteo del estado tras venta exitosa/asumida. Causa: ${error.message}`, 'error');
		log('Intentando limpieza de lastOrder y permitiendo reintento en el próximo ciclo.', 'warning');
		// La lógica de limpieza ya se hizo en la validación, pero la repetimos en caso de otro error
		try {
			await updateLStateData({ 'lastOrder': null });
		} catch (dbError) {
			 log(`FALLA DE RECUPERACIÓN: No se pudo limpiar lastOrder. Revise la conexión/estado de la DB.`, 'error');
		}
        // Propagamos el error para asegurar que el Consolidator sepa que falló el proceso de cierre
        throw error; 
	}
}

module.exports = {
    handleSuccessfulBuy,
    handleSuccessfulSell
};