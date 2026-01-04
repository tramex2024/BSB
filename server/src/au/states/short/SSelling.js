// BSB/server/src/au/states/short/SSelling.js

const { placeFirstShortOrder, placeCoverageShortOrder } = require('../../managers/shortOrderManager'); 
const { monitorAndConsolidateShort } = require('./ShortSellConsolidator'); 

async function run(dependencies) {
    const {
        botState, currentPrice, config, log,
        updateBotState, updateSStateData, updateGeneralBotState,
        availableUSDT 
    } = dependencies;

    const SYMBOL = String(config.symbol || 'BTC_USDT');
    const sStateData = botState.sStateData;

    // =================================================================
    // 1. MONITOREO DE ORDEN PENDIENTE (Prioridad)
    // =================================================================
    const orderIsActive = await monitorAndConsolidateShort(
        botState, SYMBOL, log, updateSStateData, updateBotState, updateGeneralBotState
    );
    
    if (orderIsActive) return; 

    // =================================================================
    // 2. APERTURA DE SHORT (Si no hay posición)
    // =================================================================
    if (sStateData.ppc === 0 && !sStateData.lastOrder) {
        const purchaseAmount = parseFloat(config.short.purchaseUsdt);
        const currentSBalance = parseFloat(botState.sbalance || 0);

        if (availableUSDT >= purchaseAmount && currentSBalance >= purchaseAmount) {
            log("[S]: Abriendo posición inicial SHORT...", 'info');
            await placeFirstShortOrder(config, botState, log, updateBotState, updateGeneralBotState); 
        } else {
            const reason = availableUSDT < purchaseAmount ? "Saldo Exchange insuficiente" : "Límite SBalance alcanzado";
            log(`⚠️ [S]: No se puede iniciar: ${reason}. Pasando a NO_COVERAGE.`, 'warning');
            await updateBotState('NO_COVERAGE', 'short'); 
        }
        return; 
    }

    // =================================================================
    // 3. EVALUACIÓN DE TRANSICIÓN (Take Profit o DCA)
    // =================================================================
    
    // 3A. TAKE PROFIT: El precio bajó lo suficiente para recomprar con ganancia
    if (botState.stprice > 0 && currentPrice <= botState.stprice) {
        log(`💰 [S-TP] Objetivo alcanzado: ${currentPrice.toFixed(2)} <= ${botState.stprice.toFixed(2)}. Transicionando a BUYING para cerrar.`, 'success');
        await updateBotState('BUYING', 'short');
        return;
    }

    // 3B. COBERTURA (DCA): El precio subió y necesitamos promediar la venta más arriba
    const requiredAmount = sStateData.requiredCoverageAmount;
    
    if (!sStateData.lastOrder && sStateData.nextCoveragePrice > 0 && currentPrice >= sStateData.nextCoveragePrice) {
        
        const hasBalance = botState.sbalance >= requiredAmount && availableUSDT >= requiredAmount;

        if (hasBalance) {
            log(`📈 [S-DCA] Precio alcanzado (${currentPrice.toFixed(2)}). Vendiendo más para subir PPC...`, 'warning');
            try {
                await placeCoverageShortOrder(botState, requiredAmount, log, updateGeneralBotState, updateBotState);
            } catch (error) {
                log(`❌ [S]: Error en cobertura: ${error.message}`, 'error');
            }
        } else {
            log(`🚫 [S-DCA] Fondos insuficientes. SBalance: ${botState.sbalance.toFixed(2)}, Real: ${availableUSDT.toFixed(2)}. Pasando a NO_COVERAGE.`, 'error');
            await updateBotState('NO_COVERAGE', 'short');
        }
        return;
    }

    // 4. LOG DE ESTADO
    const logSummary = `[S] SELLING | PPC: ${sStateData.ppc.toFixed(2)} | TP: ${botState.stprice.toFixed(2)} | DCA: ${sStateData.nextCoveragePrice.toFixed(2)}`;
    log(logSummary, 'debug');
}

module.exports = { run };