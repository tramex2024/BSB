// BSB/server/src/services/exitLiquidationService.js

const ExitLiquidationService = {
    /**
     * Genera un reporte de qué activos hay que vender o comprar para volver a USDT puro.
     */
    async getExitReport(strategyType, botState, currentPrice) {
        let report = {
            strategy: strategyType,
            hasPendingAssets: false,
            assetToLiquidate: 'BTC',
            amount: 0,
            initialValueUsdt: 0,
            currentValueUsdt: 0,
            pnlUsdt: 0,
            pnlPercentage: 0
        };

        if (strategyType === 'short') {
            // El Short tiene BTC que "sobró" o que se compró al inicio
            const sac = parseFloat(botState.sac || 0);
            const initialBtc = parseFloat(botState.sInitialPurchaseQty || 0);
            const avgPrice = parseFloat(botState.sInitialPurchasePrice || 0);
            
            report.amount = sac > 0 ? sac : initialBtc;
            report.initialValueUsdt = report.amount * avgPrice;
            report.hasPendingAssets = report.amount > 0.000001;
        } 
        else if (strategyType === 'long' || strategyType === 'ai') {
            // El Long/IA tiene BTC que compró y aún no ha vendido
            const prefix = strategyType === 'long' ? 'l' : 'ai';
            const ac = parseFloat(botState[`${prefix}ac`] || 0); // Accumulated Coins
            const ppc = parseFloat(botState[`${prefix}ppc`] || 0); // Price Average
            
            report.amount = ac;
            report.initialValueUsdt = ac * ppc;
            report.hasPendingAssets = ac > 0.000001;
        }

        if (report.hasPendingAssets && currentPrice > 0) {
            report.currentValueUsdt = report.amount * currentPrice;
            report.pnlUsdt = report.currentValueUsdt - report.initialValueUsdt;
            report.pnlPercentage = ((currentPrice / (report.initialValueUsdt / report.amount)) - 1) * 100;
        }

        return report;
    }
};