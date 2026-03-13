/**
 * ExitLiquidationService.js
 * Genera un reporte de liquidación mapeado a los campos de la DB.
 * Versión: Operativa a Mercado (Sin Open Orders) y soporte IA Core.
 */
const ExitLiquidationService = {   
    async getExitReport(strategyType, botState, currentPrice) {
        const report = {
            strategy: strategyType,
            hasPendingAssets: false,
            assetToLiquidate: 'BTC',
            amount: 0,
            avgPrice: 0,
            initialValueUsdt: 0,
            currentValueUsdt: 0,
            pnlUsdt: 0,
            pnlPercentage: 0
        };

        // Normalizamos el prefijo para la DB (l, s, ai)
        const prefix = strategyType.toLowerCase() === 'ai' ? 'ai' : (strategyType.toLowerCase() === 'long' ? 'l' : 's');

        // 1. Extracción de Datos de la Base de Datos
        if (strategyType.toLowerCase() === 'short') {
            // El Short utiliza sus campos específicos de balance acumulado (sac)
            const sac = parseFloat(botState.sac || 0);
            const sppc = parseFloat(botState.sppc || 0); 
            
            report.amount = sac;
            report.avgPrice = sppc > 0 ? sppc : parseFloat(botState.sInitialPurchasePrice || 0);
        } 
        else {
            // Caso: Long o AI (utilizan prefijos dinámicos: lac/aiac y lppc/aippc)
            const ac = parseFloat(botState[`${prefix}ac`] || 0);  
            const ppc = parseFloat(botState[`${prefix}ppc`] || 0); 
            
            report.amount = ac;
            report.avgPrice = ppc;
        }

        // 2. Cálculos Financieros
        report.initialValueUsdt = report.amount * report.avgPrice;
        report.hasPendingAssets = report.amount > 0.000001;

        if (report.hasPendingAssets && currentPrice > 0) {
            report.currentValueUsdt = report.amount * currentPrice;
            report.pnlUsdt = report.currentValueUsdt - report.initialValueUsdt;

            if (report.avgPrice > 0) {
                // Lógica de PnL: Inversa para Short, estándar para Long/AI
                if (strategyType.toLowerCase() === 'short') {
                    report.pnlPercentage = ((report.avgPrice / currentPrice) - 1) * 100;
                } else {
                    report.pnlPercentage = ((currentPrice / report.avgPrice) - 1) * 100;
                }
            }
        }

        // 3. Formateo Final para el Frontend
        // Se envía dentro de 'data' para compatibilidad con el controlador y botControls.js
        return {
            status: 'success',
            data: {
                pnlUsdt: report.pnlUsdt.toFixed(2),
                pnlPercentage: report.pnlPercentage.toFixed(2),
                liquidationAmount: report.amount.toFixed(6),
                liquidationAsset: report.assetToLiquidate,
                avgPrice: report.avgPrice.toFixed(2)
                // Se elimina openOrders ya que la operativa es a mercado
            }
        };
    }
};

module.exports = ExitLiquidationService;