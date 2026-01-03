// BSB/server/src/states/short/SSelling.js (Espejo de LBuying.js)

// BSB/server/src/au/states/short/SSelling.js (ESPEJO DE LBuying.js)

const { calculateShortTargets } = require('../../../../autobotCalculations');
const { parseNumber } = require('../../../../utils/helpers'); 
// 💡 IMPORTACIONES PARA SHORT
const { placeFirstShortOrder, placeCoverageShortOrder } = require('../../managers/shortOrderManager'); 
// ✅ CONSOLIDADOR DE APERTURA SHORT
const { monitorAndConsolidateShort } = require('./ShortSellConsolidator'); 

async function run(dependencies) {
    const {
        botState, currentPrice, config, log,
        updateBotState, updateSStateData, updateGeneralBotState,
        availableUSDT // Balance para vender (Short utiliza margen/USDT)
    } = dependencies;

    const SYMBOL = String(config.symbol || 'BTC_USDT');
    const sStateData = botState.sStateData;

    // =================================================================
    // === [ 0. APERTURA DE POSICIÓN SHORT (Venta Inicial) ] ============
    // =================================================================
    if (sStateData.ppc === 0 && !sStateData.lastOrder) {
        log("[S]: Estado inicial detectado. Iniciando apertura de SHORT...", 'warning');

        const purchaseAmount = parseFloat(config.short.purchaseUsdt);
        const MIN_USDT_VALUE_FOR_BITMART = 5.00; 
        
        const currentSBalance = parseFloat(botState.sbalance || 0);

        const isRealBalanceSufficient = availableUSDT >= purchaseAmount && purchaseAmount >= MIN_USDT_VALUE_FOR_BITMART;
        const isCapitalLimitSufficient = currentSBalance >= purchaseAmount;
        
        if (isRealBalanceSufficient && isCapitalLimitSufficient) {
            log("[S]: Verificaciones aprobadas. Colocando primera orden de VENTA (Short)...", 'info');

            // 🎯 Coloca la orden de venta inicial para abrir el Short
            await placeFirstShortOrder(config, botState, log, updateBotState, updateGeneralBotState); 
            
            log("[S]: Orden inicial enviada. Esperando consolidación.", 'success');

        } else {
            let reason = '';
            if (!isRealBalanceSufficient) {
                reason = `Fondos REALES (${availableUSDT.toFixed(2)} USDT) insuficientes.`;
            } else if (!isCapitalLimitSufficient) {
                reason = `LÍMITE ASIGNADO SHORT (${currentSBalance.toFixed(2)} USDT) insuficiente.`;
            }

            log(`[S]: No se puede iniciar Short. ${reason} Transicionando a NO_COVERAGE.`, 'warning');
            await updateBotState('NO_COVERAGE', 'short'); 
        }
        return; 
    }

    // =================================================================
    // === [ 1. MONITOREO Y CONSOLIDACIÓN DE VENTA PENDIENTE ] =========
    // =================================================================
    
    const orderIsPendingOrProcessed = await monitorAndConsolidateShort(
        botState, SYMBOL, log, updateSStateData, updateBotState, updateGeneralBotState
    );
    
    if (orderIsPendingOrProcessed) return; 
    
    // =================================================================
    // === [ 2. GESTIÓN DE TARGETS SHORT ] ==============================
    // =================================================================
    
    if (sStateData.ppc > 0) { 
        const logSummary = `
            [S] SELLING:            
            💰 PPC Short: ${sStateData.ppc.toFixed(2)} USD (AC: ${sStateData.ac.toFixed(8)} BTC).
            🎯 TP Objetivo (Recompra): ${botState.stprice.toFixed(2)} USD.
            📈 Proxima Cobertura (DCA): ${sStateData.nextCoveragePrice.toFixed(2)} USD (Monto: ${sStateData.requiredCoverageAmount.toFixed(2)} USDT).
            🛡️ Cobertura Máxima (S-Coverage): ${botState.scoverage.toFixed(2)} USD.
        `.replace(/\s+/g, ' ').trim();
        log(logSummary, 'debug'); 

    } else if (!sStateData.lastOrder && sStateData.ppc === 0) {
        log("[S]: Posición inicial (AC=0). Esperando señal de entrada.", 'info');
    }

    // =================================================================
    // === [ 3. EVALUACIÓN DE TRANSICIONES ] ===========================
    // =================================================================
    
    // 3A. Transición a BUYING por Take Profit (stprice alcanzado hacia ABAJO)
    if (botState.stprice > 0 && currentPrice <= botState.stprice) {
        log(`[SHORT] ¡TARGET DE RECOMPRA alcanzado! Precio: ${currentPrice.toFixed(2)} <= ${botState.stprice.toFixed(2)}. Transicionando a BUYING (Profit).`, 'success');
        
        await updateBotState('BUYING', 'short');
        return;
    }

    // 3B. Colocación de COBERTURA (DCA hacia ARRIBA)
    const requiredAmount = sStateData.requiredCoverageAmount;

    if (!sStateData.lastOrder && sStateData.nextCoveragePrice > 0 && currentPrice >= sStateData.nextCoveragePrice) {
        
        if (requiredAmount <= 0) {
            log(`[S]: Error: Monto requerido 0. Transicionando a NO_COVERAGE.`, 'error');
            await updateBotState('NO_COVERAGE', 'short'); 
            return; 
        }

        if (botState.sbalance >= requiredAmount && availableUSDT >= requiredAmount) {
            log(`[SHORT] ¡Precio de COBERTURA alcanzado! Precio: ${currentPrice.toFixed(2)} >= ${sStateData.nextCoveragePrice.toFixed(2)}. Vendiendo más (DCA).`, 'warning');
            
            try {
                await placeCoverageShortOrder(botState, requiredAmount, log, updateGeneralBotState, updateBotState);
            } catch (error) {
                log(`[S]: Error en orden de COBERTURA: ${error.message}.`, 'error');
            }
            return;

        } else {
            log(`[S]: Cobertura alcanzada pero fondos insuficientes. Transicionando a NO_COVERAGE.`, 'error');
            await updateBotState('NO_COVERAGE', 'short');
            return;
        }
    }
    
    if (!sStateData.lastOrder && sStateData.ppc > 0) return;

    log(`[S]SELLING: Monitoreando...`, 'debug');
}

module.exports = { run };