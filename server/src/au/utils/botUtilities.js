// BSB/server/src/utils/botUtilities.js

/**
 * MIGRACIÓN 2026 - UTILIDADES DE SISTEMA
 * Este archivo gestiona el mantenimiento y Hard Reset de los bots.
 * A diferencia de los DataManagers, este reseteo se usa para emergencias 
 * o limpiezas manuales solicitadas por el usuario.
 */

const Autobot = require('../../../models/Autobot'); 
const { log } = require('../../../services/loggerService'); 
const { CLEAN_LONG_ROOT, CLEAN_SHORT_ROOT } = require('../au/utils/cleanState');

/**
 * Función de reseteo total del bot para un usuario específico.
 * Preserva configuración, profit acumulado y el histórico de ciclos.
 * * @param {string} userId - El ID único del usuario propietario del bot.
 */
async function resetAndInitializeBot(userId) {
    if (!userId) {
        console.error("❌ [SYSTEM] Error: Se requiere userId para ejecutar el reset.");
        return;
    }

    try {
        // 1. Buscamos el bot actual del usuario
        const currentBot = await Autobot.findOne({ userId });
        
        if (!currentBot) {
            console.log(`⚠️ [SYSTEM] No existe bot para el usuario: ${userId}.`);
            return;
        }

        // 2. Extraemos datos que NO queremos perder (Configuración y Éxitos)
        const config = currentBot.config || {}; 
        const totalProfit = parseFloat(currentBot.total_profit) || 0; 
        const lcycle = parseInt(currentBot.lcycle) || 0;
        const scycle = parseInt(currentBot.scycle) || 0;

        // 3. Restauramos los balances iniciales desde la configuración
        // Si el usuario cambió su capital en el config, el reset aplicará ese nuevo monto.
        const initialLBalance = config.long?.amountUsdt || 0; 
        const initialSBalance = config.short?.amountUsdt || 0; 

        // 4. Construcción del objeto de reseteo (Siglas Raíz 2026)
        const resetData = {
            // Estado operativo
            "lstate": "STOPPED",
            "sstate": "STOPPED",
            "total_profit": totalProfit,
            "lcycle": lcycle,
            "scycle": scycle,
            "lbalance": initialLBalance, 
            "sbalance": initialSBalance, 

            // Aplicamos limpieza profunda de promedios, órdenes y trailings
            ...CLEAN_LONG_ROOT,
            ...CLEAN_SHORT_ROOT,

            "updatedAt": new Date()
        };

        // 5. Actualización atómica en base de datos
        // Usamos updateOne con userId para garantizar que NO tocamos a otros usuarios.
        await Autobot.updateOne(
            { userId: userId }, 
            { $set: resetData }
        );
        
        console.log(`✅ [SYSTEM] Hard Reset exitoso para el usuario: ${userId}`);
        console.log(`📊 Datos preservados -> Profit: $${totalProfit} | Ciclos: L(${lcycle}) S(${scycle})`);
        
    } catch (error) {
        console.error(`❌ [SYSTEM] Error crítico en resetAndInitializeBot: ${error.message}`);
    }
}

module.exports = {
    resetAndInitializeBot
};