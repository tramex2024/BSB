// BSB/server/src/services/shortLiquidationService.js

async function getShortExitSummary(userId, currentBotState, currentPrice) {
    const { sInitialPurchasePrice, sInitialPurchaseQty, sac } = currentBotState;
    
    // Si no hubo compra inicial o no hay balance acumulado, no hay nada que liquidar
    if (!sInitialPurchasePrice || sInitialPurchaseQty <= 0) return null;

    // El BTC "sobrante" es lo que compramos al inicio menos lo que se vendió (si hubo error o cierre parcial)
    // O simplemente el 'sac' si queremos cerrar la posición completa.
    const btcToLiquidate = parseFloat(sac || 0) > 0 ? sac : sInitialPurchaseQty;
    
    const initialCost = sInitialPurchaseQty * sInitialPurchasePrice;
    const currentVal = sInitialPurchaseQty * currentPrice;
    
    const netProfitUsdt = currentVal - initialCost;
    const profitPercent = ((currentPrice / sInitialPurchasePrice) - 1) * 100;

    return {
        btcToLiquidate,
        initialPrice: sInitialPurchasePrice,
        currentPrice: currentPrice,
        netProfitUsdt: netProfitUsdt.toFixed(2),
        profitPercent: profitPercent.toFixed(2),
        status: netProfitUsdt >= 0 ? 'PROFIT' : 'LOSS'
    };
}