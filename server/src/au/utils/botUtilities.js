// BSB/server/src/utils/botUtilities.js

const Autobot = require('../../../models/Autobot'); 
// Importación de log adaptada para ser usada de forma independiente
const { log } = require('../../../services/loggerService'); 

/**
 * Función de reseteo total del bot.
 * Se usa para limpiar la base de datos manteniendo solo la configuración y el profit histórico.
 */
async function resetAndInitializeBot() {
    try {
        const currentBot = await Autobot.findOne({});
        
        // Preservamos la configuración actual y el profit acumulado
        const config = currentBot ? currentBot.config : {}; 
        const totalProfit = currentBot ? (parseFloat(currentBot.total_profit) || 0) : 0; 
        
        // Obtenemos balances iniciales desde el config preservado
        const initialLBalance = config.long?.amountUsdt || 0; 
        const initialSBalance = config.short?.amountUsdt || 0; 

        // Eliminación física del documento
        await Autobot.deleteMany({});
        console.log('Documento Autobot eliminado completamente.');
        
        const newBotData = {
            "lstate": "STOPPED", // Se inicializa en STOPPED por seguridad
            "sstate": "STOPPED",
            "config": config,
            "total_profit": totalProfit,
            "lbalance": initialLBalance, 
            "sbalance": initialSBalance, 
            "lStateData": { 
                "ppc": 0, "ac": 0, "ai": 0, "orderCountInCycle": 0, 
                "lastOrder": null, "pm": 0, "pc": 0, 
                "requiredCoverageAmount": 0, "nextCoveragePrice": 0,
                "cycleStartTime": null
            },
            "sStateData": { 
                "ppc": 0, "ac": 0, "ai": 0, "orderCountInCycle": 0, 
                "lastOrder": null, "pm": 0, "pc": 0, 
                "requiredCoverageAmount": 0, "nextCoveragePrice": 0,
                "cycleStartTime": null
            },
            "lcycle": 0, "lnorder": 0, "ltprice": 0, "lsprice": 0,
            "scycle": 0, "snorder": 0, "stprice": 0, "sbprice": 0,
        };
        
        const newAutobot = new Autobot(newBotData);
        await newAutobot.save();
        
        console.log(`✅ Autobot Re-inicializado. L-Bal: ${initialLBalance} | S-Bal: ${initialSBalance}. Config preservada.`);
        
    } catch (error) {
        console.error(`❌ Error en resetAndInitializeBot: ${error.message}`);
    }
}

module.exports = {
    resetAndInitializeBot
};