// BSB/server/src/states/long/LBuying.js (Refactorizado para consistencia y persistencia)

// 🛑 Importaciones Esenciales
const { 
    calculateLongTargets 
} = require('../../utils/dataManager');
const { parseNumber } = require('../../../utils/helpers'); 
const { placeFirstBuyOrder, placeCoverageBuyOrder } = require('../../utils/orderManager'); 
const { monitorAndConsolidate } = require('./LongBuyConsolidator'); 


async function run(dependencies) {
    const {
        botState, currentPrice, config, log,
        updateBotState, updateLStateData, updateGeneralBotState,
        availableUSDT 
    } = dependencies; // Se ha quitado explícitamente 'getBotState' para resolver el error.

    // =================================================================
    // === [ PRUEBA DE PERSISTENCIA DB PARA 'ai' ] =====================
    // =================================================================
    // Esta prueba verifica si updateGeneralBotState está funcionando correctamente
    // y si el botState es cargado correctamente en el siguiente ciclo.
    const currentAi = botState.ai || 0; 
    const nextAi = currentAi + 1; 
    
    log(`TEST PERSISTENCIA: Valor 'ai' de entrada: ${currentAi}. Escribiendo nuevo valor: ${nextAi}`, 'warning');
    
    // Escribir el nuevo valor en la DB.
    // Asumimos que 'ai' es un campo de nivel superior en el documento de estado del bot.
    await updateGeneralBotState({ ai: nextAi }); 
    
    // Si la prueba funciona, en el próximo ciclo (ai) de entrada será 'nextAi'.
    // =================================================================
    // =================================================================


    const SYMBOL = String(config.symbol || 'BTC_USDT');
    // Si lStateData no existe (esquema antiguo), se usará una estructura por defecto.
    const lStateData = botState.lStateData || { 
        ppc: 0, ac: 0, ai: 0, orderCountInCycle: 0, lastOrder: null, pm: 0, pc: 0, 
        requiredCoverageAmount: 0, nextCoveragePrice: 0 
    };

    log(`Estado Long: BUYING. Verificando última orden y targets. PPC: ${lStateData.ppc.toFixed(2)}`, 'info');

    // =================================================================
    // === [ 0. COLOCACIÓN DE PRIMERA ORDEN ] ============================
    // =================================================================
    if (lStateData.ppc === 0 && lStateData.orderCountInCycle === 0 && !lStateData.lastOrder) {
        log("Iniciando lógica de primera compra...", 'warning');

        const purchaseAmount = parseFloat(config.long.purchaseUsdt);
        const MIN_USDT_VALUE_FOR_BITMART = 5.00; 
        const currentLBalance = parseFloat(botState.lbalance || 0);

        const isRealBalanceSufficient = availableUSDT >= purchaseAmount && purchaseAmount >= MIN_USDT_VALUE_FOR_BITMART;
        const isCapitalLimitSufficient = currentLBalance >= purchaseAmount;
        
        if (isRealBalanceSufficient && isCapitalLimitSufficient) {
            log("Verificaciones de fondos aprobadas. Colocando la primera orden...", 'info');
            // La función placeFirstBuyOrder maneja la actualización de lastOrder y lStateData
            await placeFirstBuyOrder(config, log, updateBotState, updateGeneralBotState); 
            
        } else {
            let reason = '';
            if (!isRealBalanceSufficient) {
                reason = `Fondos REALES (${availableUSDT.toFixed(2)} USDT) insuficientes.`;
            } else if (!isCapitalLimitSufficient) {
                reason = `LÍMITE DE CAPITAL ASIGNADO (${currentLBalance.toFixed(2)} USDT) insuficiente.`;
            }

            log(`No se puede iniciar la orden. ${reason} Transicionando a NO_COVERAGE.`, 'warning');
            await updateBotState('NO_COVERAGE', 'long'); 
        }
        
        return; 
    }

    // =================================================================
    // === [ 1. MONITOREO Y CONSOLIDACIÓN DE ORDEN PENDIENTE ] =========
    // =================================================================
    
    const orderIsPendingOrProcessed = await monitorAndConsolidate(
        botState, SYMBOL, log, updateLStateData, updateBotState, updateGeneralBotState
    );
    
    if (orderIsPendingOrProcessed) {
        // Si hay una orden pendiente o se acaba de consolidar, se detiene aquí.
        return; 
    }
    
    // Si no hay orden pendiente (lStateData.lastOrder es null), procedemos a calcular targets.
    
    // =================================================================
    // === [ 2. CÁLCULO Y GESTIÓN DE TARGETS ] ===========================
    // =================================================================
    if (!lStateData.lastOrder && lStateData.ppc > 0) { 
        log("Calculando objetivos (Venta/Cobertura) y Límite de Cobertura...", 'info');
    
        const { 
            targetSellPrice, 
            nextCoveragePrice, 
            requiredCoverageAmount, 
            lCoveragePrice,     
            lNOrderMax            
        } = calculateLongTargets(
            lStateData.ppc, 
            config.long.profit_percent, 
            config.long.price_var, 
            config.long.size_var,
            config.long.purchaseUsdt,
            lStateData.orderCountInCycle,
            botState.lbalance 
        );

        // 🎯 ACTUALIZACIÓN ATÓMICA DE TARGETS EN LA DB
        // Nota: Si 'ltprice', 'lcoverage', 'lnorder' son campos de primer nivel,
        // y el resto está en 'lStateData', este objeto funciona correctamente.
        const targetsUpdate = {
            ltprice: targetSellPrice,
            lcoverage: lCoveragePrice, 
            lnorder: lNOrderMax,          
            'lStateData.requiredCoverageAmount': requiredCoverageAmount, // Acceso anidado
            'lStateData.nextCoveragePrice': nextCoveragePrice,          // Acceso anidado
        };

        await updateGeneralBotState(targetsUpdate);

        // 💡 Actualizamos la referencia local (botState) para el ciclo actual
        lStateData.requiredCoverageAmount = requiredCoverageAmount; 
        lStateData.nextCoveragePrice = nextCoveragePrice;

        const logSummary = `
            Targets LONG actualizados.
            💰 PPC: ${lStateData.ppc.toFixed(2)} USD.
            🎯 TP Venta: ${targetSellPrice.toFixed(2)} USD.
            📉 DCA Cobertura: ${nextCoveragePrice.toFixed(2)} USD (Monto: ${requiredCoverageAmount.toFixed(2)} USDT).
            🛡️ Límite de Cobertura: ${lCoveragePrice.toFixed(2)} USD (Órdenes restantes: ${lNOrderMax}).
        `.replace(/\s+/g, ' ').trim();
        log(logSummary, 'warning'); 
    } 
    
    // =================================================================
    // === [ 3. EVALUACIÓN DE TRANSICIÓN DE ESTADO/COLOCACIÓN DE ORDEN ] =
    // =================================================================
    
    // 3A. Transición a SELLING por Take Profit
    if (botState.ltprice > 0 && currentPrice >= botState.ltprice) {
        log(`[LONG] ¡TARGET DE VENTA alcanzado! Transicionando a SELLING.`, 'success');
        await updateBotState('SELLING', 'long');
        return;
    }

    // 3B. Colocación de ORDEN de COBERTURA (DCA)
    const requiredAmount = lStateData.requiredCoverageAmount || 0;

    if (!lStateData.lastOrder && lStateData.nextCoveragePrice > 0 && currentPrice <= lStateData.nextCoveragePrice) {
        
        if (requiredAmount <= 0) {
            log(`Error: Monto de cobertura (${requiredAmount}) no válido. Transicionando a NO_COVERAGE.`, 'error');
            await updateBotState('NO_COVERAGE', 'long'); 
            return; 
        }

        if (botState.lbalance >= requiredAmount) {
            log(`[LONG] ¡Precio de COBERTURA alcanzado! Colocando orden de compra DCA.`, 'warning');
            
            try {
                // placeCoverageBuyOrder actualiza lastOrder y lStateData
                await placeCoverageBuyOrder(botState, requiredAmount, lStateData.nextCoveragePrice, log, updateGeneralBotState, updateBotState);
            } catch (error) {
                log(`Error CRÍTICO al colocar la orden de COBERTURA: ${error.message}.`, 'error');
            }
            return; 

        } else {
            log(`Advertencia: Cobertura alcanzada, pero capital (${botState.lbalance.toFixed(2)} USDT) insuficiente. Transicionando a NO_COVERAGE.`, 'error');
            await updateBotState('NO_COVERAGE', 'long');
            return;
        }
    }
    
    // 3C. Log final (Permanece en BUYING)
    log(`Monitoreando... Venta: ${botState.ltprice.toFixed(2)}, Cobertura: ${lStateData.nextCoveragePrice.toFixed(2)}.`, 'debug');
}

module.exports = { run };