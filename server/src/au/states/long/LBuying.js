// BSB/server/src/au/states/long/LBuying.js (OPTIMIZADO PARA ATOMIC UPDATES)

const { placeFirstBuyOrder, placeCoverageBuyOrder } = require('../../managers/longOrderManager'); 
const { monitorAndConsolidate } = require('./LongBuyConsolidator'); 

async function run(dependencies) {
    const {
        botState, currentPrice, config, log,
        updateBotState, updateLStateData, updateGeneralBotState,
        availableUSDT // Balance real inyectado desde el loop principal
    } = dependencies;

    const SYMBOL = String(config.symbol || 'BTC_USDT');
    const lStateData = botState.lStateData;

    // =================================================================
    // 1. MONITOREO DE ORDEN PENDIENTE (Prioridad Máxima)
    // =================================================================
    // Si hay una orden en curso, no hacemos nada más hasta que se llene o cancele.
    const orderIsActive = await monitorAndConsolidate(
        botState, SYMBOL, log, updateLStateData, updateBotState, updateGeneralBotState
    );
    
    if (orderIsActive) return; 

    // =================================================================
    // 2. LÓGICA DE PRIMERA COMPRA (Si la posición está vacía)
    // =================================================================
    if (lStateData.ppc === 0 && !lStateData.lastOrder) {
        const purchaseAmount = parseFloat(config.long.purchaseUsdt);
        const currentLBalance = parseFloat(botState.lbalance || 0);

        if (availableUSDT >= purchaseAmount && currentLBalance >= purchaseAmount) {
            log("🚀 Iniciando Ciclo: Colocando primera compra...", 'info');
            await placeFirstBuyOrder(config, botState, log, updateBotState, updateGeneralBotState); 
        } else {
            const reason = availableUSDT < purchaseAmount ? "Saldo Exchange insuficiente" : "Límite de capital (LBalance) alcanzado";
            log(`⚠️ No se puede iniciar ciclo: ${reason}. Pasando a NO_COVERAGE.`, 'warning');
            await updateBotState('NO_COVERAGE', 'long'); 
        }
        return; 
    }

    // =================================================================
    // 3. EVALUACIÓN DE SALIDA (Take Profit o Cobertura)
    // =================================================================
    
    // 3A. ¿Es hora de vender con ganancia? (Take Profit)
    if (botState.ltprice > 0 && currentPrice >= botState.ltprice) {
        log(`💰 [TP] Objetivo alcanzado: ${currentPrice.toFixed(2)} >= ${botState.ltprice.toFixed(2)}. Transicionando a SELLING.`, 'success');
        await updateBotState('SELLING', 'long');
        return;
    }

    // 3B. ¿Es hora de promediar? (Cobertura/DCA)
    const requiredAmount = lStateData.requiredCoverageAmount;
    
    if (!lStateData.lastOrder && lStateData.nextCoveragePrice > 0 && currentPrice <= lStateData.nextCoveragePrice) {
        
        // Verificamos fondos antes de disparar la orden
        const hasBalance = botState.lbalance >= requiredAmount && availableUSDT >= requiredAmount;

        if (hasBalance) {
            log(`📉 [DCA] Precio de cobertura alcanzado (${currentPrice.toFixed(2)}). Comprando más BTC para bajar PPC...`, 'warning');
            try {
                // Esta función ya debe usar los update correspondientes internamente
                await placeCoverageBuyOrder(botState, requiredAmount, log, updateGeneralBotState, updateBotState);
            } catch (error) {
                log(`❌ Error en orden de cobertura: ${error.message}`, 'error');
            }
        } else {
            log(`🚫 [DCA] Fondos insuficientes para cobertura. LBalance: ${botState.lbalance.toFixed(2)}, Real: ${availableUSDT.toFixed(2)}. Pasando a NO_COVERAGE.`, 'error');
            await updateBotState('NO_COVERAGE', 'long');
        }
        return;
    }

    // 4. LOG DE ESTADO (Solo si no hay cambios)
    const logSummary = `[L] BUYING | PPC: ${lStateData.ppc.toFixed(2)} | TP: ${botState.ltprice.toFixed(2)} | DCA: ${lStateData.nextCoveragePrice.toFixed(2)}`;
    log(logSummary, 'debug');
}

module.exports = { run };