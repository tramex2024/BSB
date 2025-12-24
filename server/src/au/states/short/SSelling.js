// BSB/server/src/states/short/SSelling.js (Espejo de LBuying.js)

const { calculateShortTargets } = require('../../../../autobotCalculations'); // 💡 Se asume una función calculateShortTargets
// 💡 IMPORTACIONES PARA ORDENES SHORT
const { placeFirstSellOrder, placeCoverageSellOrder } = require('../../managers/shortOrderManager'); 
// ✅ Se asume un módulo consolidator Short
const { monitorAndConsolidateShort } = require('./ShortSellConsolidator'); 
const { MIN_USDT_VALUE_FOR_BITMART } = require('../../utils/tradeConstants');


async function run(dependencies) {
    const {
        botState, currentPrice, config, log,
        updateBotState, updateSStateData, updateGeneralBotState,
        availableBTC // 💡 Se asume un campo disponibleBTC
    } = dependencies;

    const SYMBOL = String(config.symbol || 'BTC_USDT');
    const sStateData = botState.sStateData;
    const S_STATE = 'short';

    log("Estado Short: SELLING. Verificando el estado de la última orden de venta o gestionando targets...", 'info');

    // =================================================================
    // === [ 0. COLOCACIÓN DE PRIMERA ORDEN (Lógica Integrada) ] ==========
    // =================================================================
    if (sStateData.ppc === 0 && sStateData.orderCountInCycle === 0 && !sStateData.lastOrder) {
        log("Estado de posición inicial detectado. Iniciando lógica de primera venta (Short)...", 'warning');

        const firstSellAmountBtc = parseFloat(config.short.purchaseBtc); // Cantidad de BTC a vender en corto
        const currentSBalance = parseFloat(botState.sbalance || 0); // Capital BTC disponible para el corto

        const isRealBalanceSufficient = availableBTC >= firstSellAmountBtc; // Verificación de fondos reales
        const isCapitalLimitSufficient = currentSBalance >= firstSellAmountBtc; // Verificación de límite asignado

        if (isRealBalanceSufficient && isCapitalLimitSufficient) {
            log("Verificaciones de fondos BTC y límite aprobadas. Colocando la primera orden Short...", 'info');

            // 🎯 Coloca la orden, actualiza lastOrder y descuenta sbalance.
            // NOTA: Se necesita implementar esta función en shortOrderManager.js
            await placeFirstSellOrder(config, log, updateBotState, updateGeneralBotState); 
            
            log("Primera orden Short colocada exitosamente. Esperando al próximo ciclo para monitorear.", 'success');

        } else {
            let reason = '';
            if (!isRealBalanceSufficient) {
                reason = `Fondos REALES BTC (${availableBTC.toFixed(8)} BTC) insuficientes para abrir corto.`;
            } else if (!isCapitalLimitSufficient) {
                reason = `LÍMITE DE CAPITAL ASIGNADO BTC (${currentSBalance.toFixed(8)} BTC) insuficiente.`;
            }

            log(`No se puede iniciar la orden Short. ${reason} Cambiando a NO_COVERAGE.`, 'warning');
            await updateBotState('NO_COVERAGE', S_STATE); 
        }
        
        return; // Detener el ciclo para esperar la próxima iteración.
    }

    // =================================================================
    // === [ 1. MONITOREO Y CONSOLIDACIÓN DE ORDEN PENDIENTE ] =========
    // =================================================================
    
    // 💡 Llama al ShortSellConsolidator (Se asume que existe)
    const orderIsPendingOrProcessed = await monitorAndConsolidateShort(
        botState, SYMBOL, log, updateSStateData, updateBotState, updateGeneralBotState
    );
    
    if (orderIsPendingOrProcessed) {
        return; 
    }
    
    // =================================================================
    // === [ 2. CÁLCULO Y GESTIÓN DE TARGETS ] ===========================
    // =================================================================
    if (!sStateData.lastOrder && sStateData.ppc > 0) { 
        log("Calculando objetivos iniciales (Cierre/Cobertura) y Límite de Cobertura Short...", 'info');
    
        const { 
            targetBuyPrice, // 💡 Nuevo nombre
            nextCoveragePrice, 
            requiredCoverageAmountBtc, // 💡 Nuevo campo (en BTC)
            sCoveragePrice, 
            sNOrderMax         
        } = calculateShortTargets(
            sStateData.ppc, 
            config.short.profit_percent, 
            config.short.price_var, 
            config.short.size_var,
            config.short.purchaseBtc,
            sStateData.orderCountInCycle,
            botState.sbalance 
        );

        // 🎯 ACTUALIZACIÓN ATÓMICA DE TARGETS
        const targetsUpdate = {
            stprice: targetBuyPrice, // 💡 Se actualiza stprice (Target de Compra)
            scoverage: sCoveragePrice, 
            snorder: sNOrderMax,        
            // Campos de sStateData
            'sStateData.requiredCoverageAmount': requiredCoverageAmountBtc, // En BTC
            'sStateData.nextCoveragePrice': nextCoveragePrice,
        };

        await updateGeneralBotState(targetsUpdate);

        // 💡 LUEGO DE ACTUALIZAR LA DB, ACTUALIZAMOS LA REFERENCIA LOCAL
        sStateData.requiredCoverageAmount = requiredCoverageAmountBtc; 
        sStateData.nextCoveragePrice = nextCoveragePrice;

        // 🟢 LOG RESUMEN DE TARGETS
        const logSummary = `
            Estrategia SHORT: Targets y Cobertura actualizados.
            ------------------------------------------
            💰 PPC actual: ${sStateData.ppc.toFixed(2)} USD (AC: ${sStateData.ac.toFixed(8)} BTC).
            🎯 TP Objetivo (Cierre/Compra): ${targetBuyPrice.toFixed(2)} USD.
            📈 Proxima Cobertura (DCA Venta): ${nextCoveragePrice.toFixed(2)} USD (Monto: ${requiredCoverageAmountBtc.toFixed(8)} BTC).
            🛡️ Cobertura Máxima (S-Coverage): ${sCoveragePrice.toFixed(2)} USD (Órdenes restantes posibles: ${sNOrderMax}).
        `.replace(/\s+/g, ' ').trim();
        log(logSummary, 'warning'); 

    } else if (!sStateData.lastOrder && sStateData.ppc === 0) {
        log("Posición inicial (AC=0). Targets no calculados. Esperando señal de entrada.", 'info');
    }

    // =================================================================
    // === [ 3. EVALUACIÓN DE TRANSICIÓN DE ESTADO/COLOCACIÓN DE ORDEN ] =
    // =================================================================
    
    // 3A. Transición a BUYING por Take Profit (stprice alcanzado, precio CAE)
    if (botState.stprice > 0 && currentPrice <= botState.stprice) { // 🛑 INVERSIÓN: Precio debe CAER
        log(`[SHORT] ¡TARGET DE CIERRE (Take Profit) alcanzado! Precio actual: ${currentPrice.toFixed(2)} <= ${botState.stprice.toFixed(2)}. Transicionando a BUYING.`, 'success');
        
        await updateBotState('BUYING', S_STATE);
        return;
    }

    // 3B. Colocación de ORDEN de COBERTURA (DCA Venta)
    const requiredAmountBtc = sStateData.requiredCoverageAmount;

    if (!sStateData.lastOrder && sStateData.nextCoveragePrice > 0 && currentPrice >= sStateData.nextCoveragePrice) { // 🛑 INVERSIÓN: Precio debe SUBIR
        
        if (requiredAmountBtc <= 0 || requiredAmountBtc < MIN_SELL_AMOUNT_BTC) { // 💡 Se asume MIN_SELL_AMOUNT_BTC en tradeConstants.js
            log(`Error CRÍTICO: El monto requerido para la cobertura (${requiredAmountBtc.toFixed(8)} BTC) es insuficiente. Transicionando a NO_COVERAGE.`, 'error');
            await updateBotState('NO_COVERAGE', S_STATE); 
            return; 
        }

        if (botState.sbalance >= requiredAmountBtc) { // 🛑 Verificar BTC disponible
            log(`[SHORT] ¡Precio de COBERTURA alcanzado! Precio actual: ${currentPrice.toFixed(2)} >= ${sStateData.nextCoveragePrice.toFixed(2)}. Colocando orden de VENTA (Short).`, 'warning');
            
            try {
                // Llama a la función de cobertura de VENTA (Short)
                await placeCoverageSellOrder(botState, requiredAmountBtc, sStateData.nextCoveragePrice, log, updateGeneralBotState, updateBotState);
                
            } catch (error) {
                log(`Error CRÍTICO al colocar la orden de COBERTURA Short: ${error.message}.`, 'error');
            }
            return; // Esperar el próximo ciclo para monitorear la orden.

        } else {
            log(`Advertencia: Precio de cobertura alcanzado (${sStateData.nextCoveragePrice.toFixed(2)}), pero no hay suficiente capital BTC disponible (${botState.sbalance.toFixed(8)} BTC). Transicionando a NO_COVERAGE.`, 'error');
            await updateBotState('NO_COVERAGE', S_STATE);
            return;
        }
    }
    
    // 3C. Transición por defecto o Log final (Permanece en SELLING)
    
    if (!sStateData.lastOrder && sStateData.ppc > 0) {
        log(`Monitoreando... Cierre: ${botState.stprice.toFixed(2)}, Cobertura: ${sStateData.nextCoveragePrice.toFixed(2)}. Esperando que el precio suba o caiga.`, 'debug');
        return; // Permanece en el estado SELLING
    }

    log(`Monitoreando... Cierre: ${botState.stprice.toFixed(2)}, Cobertura: ${sStateData.nextCoveragePrice.toFixed(2)}.`, 'debug');
}

module.exports = { run };