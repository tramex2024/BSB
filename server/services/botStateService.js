// BSB/server/src/services/botStateService.js

const { CLEAN_LONG_ROOT, CLEAN_SHORT_ROOT, CLEAN_AI_ROOT } = require('../au/utils/cleanState');

/**
 * RESET BOT STATE: Limpia los indicadores de ejecución sin borrar la configuración.
 */
async function resetBotState(userId, strategyType, finalReport = null) {
    let updateFields = {
        state: 'STOPPED' // El bot siempre termina en STOPPED tras el reset
    };

    // 1. Seleccionamos el set de limpieza según la estrategia
    if (strategyType === 'short') {
        updateFields = { ...updateFields, ...CLEAN_SHORT_ROOT };
    } else if (strategyType === 'long') {
        updateFields = { ...updateFields, ...CLEAN_LONG_ROOT };
    } else if (strategyType === 'ai') {
        updateFields = { ...updateFields, ...CLEAN_AI_ROOT };
    }

    // 2. Si hubo liquidación, podemos sumar el profit final al histórico total
    if (finalReport && finalReport.pnlUsdt) {
        // Usamos $inc de MongoDB para sumar el PnL de esta salida al acumulado histórico
        updateFields.$inc = { total_profit: parseFloat(finalReport.pnlUsdt) };
    }

    try {
        await BotModel.updateOne({ userId }, updateFields);
        console.log(`[STATE] Strategy ${strategyType} has been reset for User: ${userId}`);
        return true;
    } catch (error) {
        console.error(`[ERROR] Failed to reset bot state: ${error.message}`);
        throw error;
    }
}