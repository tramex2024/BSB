// Archivo: BSB/server/managers/UnifiedOrderManager.js

const Autobot = require('../models/Autobot');
const bitmartService = require('../services/bitmartService');

class UnifiedOrderManager {
    /**
     * Procesa cualquier orden terminada (FILLED)
     * @param {Object} botState - Estado actual de la DB
     * @param {Object} orderDetail - Datos de BitMart (Id, Side, FilledNotional, etc)
     * @param {String} strategyType - 'long' o 'short'
     */
    async processOrderFilled(botState, orderDetail, strategyType) {
        try {
            const isLong = strategyType === 'long';
            const stateKey = isLong ? 'lStateData' : 'sStateData';
            const currentData = botState[stateKey];

            // 1. Extraer datos de la ejecución real
            const executedPrice = parseFloat(orderDetail.filled_avg_price);
            const executedSize = parseFloat(orderDetail.filled_size);
            const executedNotional = parseFloat(orderDetail.filled_notional);

            // 2. Lógica Unificada de PPC (Precio Promedio)
            // Si es compra (Long) o venta (Short inicial), acumulamos.
            let newAC = currentData.ac + executedSize;
            let newPPC = ((currentData.ppc * currentData.ac) + (executedPrice * executedSize)) / newAC;

            // 3. Preparar actualización masiva (Evita múltiples escrituras)
            const updatePayload = {
                [`${stateKey}.ac`]: newAC,
                [`${stateKey}.ppc`]: newPPC,
                [`${stateKey}.orderCountInCycle`]: currentData.orderCountInCycle + 1,
                [`${stateKey}.lastOrder`]: null, // Limpiamos la orden procesada
                lastUpdateTime: new Date()
            };

            // 4. Guardar todo de un solo golpe
            return await Autobot.findOneAndUpdate({}, { $set: updatePayload }, { new: true });

        } catch (error) {
            console.error(`[OrderManager] Error procesando ${strategyType}:`, error);
        }
    }
}

module.exports = new UnifiedOrderManager();