// BSB/server/src/services/exitLiquidationService.js

 /**
  * Genera un reporte de liquidación mapeado a los campos de la DB.
  */     
const ExitLiquidationService = {   
    async getExitReport(strategyType, botState, currentPrice) {
        const report = {
            strategy: strategyType,
            hasPendingAssets: false,
            assetToLiquidate: 'BTC',
            amount: 0,
            avgPrice: 0,      // Nuevo: Necesario para el Modal
            openOrders: 0,    // Nuevo: Necesario para el Modal
            initialValueUsdt: 0,
            currentValueUsdt: 0,
            pnlUsdt: 0,
            pnlPercentage: 0
        };

        const prefix = strategyType === 'long' ? 'l' : (strategyType === 'short' ? 's' : 'ai');

        // 1. Extraer datos según la estrategia
        if (strategyType === 'short') {
            const sac = parseFloat(botState.sac || 0);
            const initialBtc = parseFloat(botState.sInitialPurchaseQty || 0);
            const sppc = parseFloat(botState.sppc || 0); // Precio promedio de la DB
            
            report.amount = sac > 0 ? sac : initialBtc;
            report.avgPrice = sppc > 0 ? sppc : parseFloat(botState.sInitialPurchasePrice || 0);
            report.openOrders = parseInt(botState.socc || 0);
        } 
        else {
            // Caso: Long o AI
            const ac = parseFloat(botState[`${prefix}ac`] || 0);  // Accumulated Coins
            const ppc = parseFloat(botState[`${prefix}ppc`] || 0); // Price Average (DB)
            
            report.amount = ac;
            report.avgPrice = ppc;
            report.openOrders = parseInt(botState[`${prefix}occ`] || 0);
        }

        // 2. Cálculos Financieros
        report.initialValueUsdt = report.amount * report.avgPrice;
        report.hasPendingAssets = report.amount > 0.000001;

        if (report.hasPendingAssets && currentPrice > 0) {
            report.currentValueUsdt = report.amount * currentPrice;
            report.pnlUsdt = report.currentValueUsdt - report.initialValueUsdt;

            // Cálculo seguro del porcentaje de PnL
            if (report.avgPrice > 0) {
                // Para LONG/AI: (Precio Actual / Precio Compra) - 1
                // Para SHORT: (Precio Venta / Precio Actual) - 1 (Invertido)
                if (strategyType === 'short') {
                    report.pnlPercentage = ((report.avgPrice / currentPrice) - 1) * 100;
                } else {
                    report.pnlPercentage = ((currentPrice / report.avgPrice) - 1) * 100;
                }
            }
        }

        // 3. Formateo Final para el Modal (Data Mapper)
        // Agregamos una propiedad 'data' para que coincida con lo que el frontend espera recibir
        return {
            ...report,
            data: {
                pnlUsdt: report.pnlUsdt.toFixed(2),
                pnlPercentage: report.pnlPercentage.toFixed(2),
                liquidationAmount: report.amount.toFixed(6),
                liquidationAsset: report.assetToLiquidate,
                avgPrice: report.avgPrice.toFixed(2),
                openOrders: report.openOrders
            }
        };
    }
};

module.exports = ExitLiquidationService;