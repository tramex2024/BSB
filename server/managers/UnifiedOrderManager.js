const Autobot = require('../models/Autobot');

class UnifiedOrderManager {
    async processOrderFilled(botState, orderDetail, strategyType) {
        try {
            const isLong = strategyType === 'long';
            const stateKey = isLong ? 'lStateData' : 'sStateData';
            const currentData = botState[stateKey];
            const config = botState.config[strategyType];

            // 1. Extraer datos con fallback (Compatibilidad BitMart)
            const executedPrice = parseFloat(orderDetail.priceAvg || orderDetail.filled_avg_price || 0);
            const executedSize = parseFloat(orderDetail.filledSize || orderDetail.filled_size || 0);
            
            if (executedPrice === 0 || executedSize === 0) {
                console.error(`[OrderManager] Datos de ejecución inválidos para ${strategyType}`);
                return;
            }

            // 2. Lógica de PPC y AC (Acumulación)
            let newAC = currentData.ac + executedSize;
            let newPPC = ((currentData.ppc * currentData.ac) + (executedPrice * executedSize)) / newAC;

            // 3. MATEMÁTICA EXPONENCIAL Y TARGETS
            // Calculamos el Take Profit (TP)
            const profitMult = isLong ? (1 + config.profit_percent / 100) : (1 - config.profit_percent / 100);
            const newTPPrice = newPPC * profitMult;

            // Calculamos la siguiente cobertura (Next DCA)
            const nextOrderCount = currentData.orderCountInCycle + 1;
            const priceVarMult = isLong ? (1 - config.price_var / 100) : (1 + config.price_var / 100);
            const nextCoveragePrice = executedPrice * priceVarMult;

            // Cálculo del monto para la siguiente compra (Exponencial 2^n)
            // Si la primera fue 6, la segunda es 6 * 2 = 12, la tercera 12 * 2 = 24...
            const requiredCoverageAmount = config.purchaseUsdt * Math.pow(2, nextOrderCount - 1);

            // 4. Preparar actualización masiva del documento raíz y los sub-objetos
            const updatePayload = {
                // Actualizamos el sub-objeto de la estrategia (lStateData o sStateData)
                [`${stateKey}.ac`]: newAC,
                [`${stateKey}.ppc`]: newPPC,
                [`${stateKey}.orderCountInCycle`]: nextOrderCount,
                [`${stateKey}.lastExecutionPrice`]: executedPrice,
                [`${stateKey}.nextCoveragePrice`]: nextCoveragePrice,
                [`${stateKey}.requiredCoverageAmount`]: requiredCoverageAmount,
                [`${stateKey}.lastOrder`]: null,
                
                // Actualizamos los campos globales que el bot usa para monitorear
                [isLong ? 'ltprice' : 'stprice']: newTPPrice,
                [isLong ? 'lcoverage' : 'scoverage']: nextCoveragePrice,
                [isLong ? 'lnorder' : 'snorder']: nextOrderCount,
                
                lastUpdateTime: new Date()
            };

            console.log(`[OrderManager] ✅ Ciclo ${strategyType} actualizado: PPC ${newPPC.toFixed(2)} | TP ${newTPPrice.toFixed(2)} | Next DCA: ${nextCoveragePrice.toFixed(2)} ($${requiredCoverageAmount})`);

            return await Autobot.findOneAndUpdate({}, { $set: updatePayload }, { new: true });

        } catch (error) {
            console.error(`[OrderManager] Error procesando ${strategyType}:`, error);
        }
    }
}

module.exports = new UnifiedOrderManager();