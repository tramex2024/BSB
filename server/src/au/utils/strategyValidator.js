/**
 * STRATEGY VALIDATOR - BUDGET & LIQUIDITY ENGINE
 * Auditado: Control de sobre-asignación y aislamiento de ciclos.
 */

// Función interna auxiliar para no repetir lógica
function _getNetAvailable(dependencies) {
    const { botState, availableUSDT } = dependencies;
    let committedUSDT = 0;

    // Sumamos lo que CADA estrategia tiene asignado actualmente si no están STOPPED
    if (botState.lstate !== 'STOPPED') committedUSDT += parseFloat(botState.lbalance || 0);
    if (botState.aistate !== 'STOPPED') committedUSDT += parseFloat(botState.aibalance || 0);
    if (botState.sstate !== 'STOPPED') committedUSDT += parseFloat(botState.sbalance || 0);

    return availableUSDT - committedUSDT;
}

/**
 * PREVIEW (Click en botón Start): 
 * Aquí SÍ descontamos todo para ver si queda espacio para una nueva estrategia.
 */
function getStartAnalysis(strategy, dependencies) {
    const { botState, availableBTC, currentPrice } = dependencies;
    
    const netAvailableUSDT = _getNetAvailable(dependencies);
    const config = botState.config[strategy] || {};
    
    const amountUsdt = parseFloat(config.amountUsdt || 0);
    let canPass = false;
    let requirementMsg = "";

    if (strategy === 'ai') {
        const required = parseFloat(botState.aibalance || 20); 
        canPass = netAvailableUSDT >= required;
        requirementMsg = `Required: $${required} USDT`;
    } 
    else if (strategy === 'short') {
        const btcNeeded = amountUsdt / currentPrice;
        // Puede pasar si tiene el BTC físico o si tiene USDT libre para respaldar
        canPass = (availableBTC >= btcNeeded) || (netAvailableUSDT >= amountUsdt);
        requirementMsg = `Needs: ${btcNeeded.toFixed(6)} BTC or $${amountUsdt} USDT free`;
    } 
    else { // LONG
        canPass = netAvailableUSDT >= amountUsdt;
        requirementMsg = `Required: $${amountUsdt} USDT`;
    }

    return {
        canPass,
        report: {
            title: `${strategy.toUpperCase()} PREVIEW`,
            netAvailable: `Free Funds: $${netAvailableUSDT.toFixed(2)} USDT`,
            liquidity: requirementMsg,
            disclaimer: canPass ? "Funds available." : "Insufficient free funds (already allocated to other strategies)."
        }
    };
}

/**
 * EXECUTION (Loop constante):
 * Corregido: Si la estrategia ya tiene su balance, no se auto-bloquea.
 */
function canExecuteStrategy(strategy, dependencies) {
    const { botState, availableBTC, currentPrice } = dependencies;
    
    // 1. Verificamos cuánto tiene ESTA estrategia en su bolsillo
    const myBalances = {
        long: parseFloat(botState.lbalance || 0),
        ai: parseFloat(botState.aibalance || 0),
        short: parseFloat(botState.sbalance || 0)
    };

    const myCurrentFund = myBalances[strategy] || 0;

    // 2. Si ya tiene fondos asignados (mayor a $5), la dejamos trabajar.
    // Esto evita que el balance negativo global detenga un bot que ya tiene su dinero.
    if (myCurrentFund >= 5) {
        // Caso especial Short: si ya vendió (sac > 0), debe poder seguir siempre para comprar.
        if (strategy === 'short' && parseFloat(botState.sac || 0) > 0) return true;
        return true;
    }

    // 3. Si NO tiene fondos asignados (está en $0), intentamos ver si hay saldo libre en la cuenta
    const netAvailable = _getNetAvailable(dependencies);
    
    if (strategy === 'short') {
        const btcNeeded = 10 / currentPrice; // Mínimo estimado
        return (availableBTC >= btcNeeded) || (netAvailable >= 10);
    }

    return netAvailable >= 10;
}

module.exports = { canExecuteStrategy, getStartAnalysis };