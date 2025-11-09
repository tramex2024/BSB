// BSB/server/src/utils/botUtilities.js

const Autobot = require('../../models/Autobot'); 
const { log } = require('../../autobotLogic'); // Asumiendo que puedes obtener 'log' de botLogic

// Lógica de reseteo (asume que existe)
async function resetAndInitializeBot() {
    
    const currentBot = await Autobot.findOne({});
    
    const config = currentBot ? currentBot.config : { /* ... tus valores por defecto ... */ }; 
    const initialLBalance = config.long.amountUsdt || 0; 
    const totalProfit = currentBot ? currentBot.total_profit : 0; 
    
    await Autobot.deleteMany({});
    log('Documento Autobot eliminado completamente.', 'error');
    
    const newBotData = {
        "lstate": "STOPPED", 
        "sstate": "STOPPED",
        "config": config,
        "total_profit": totalProfit,
        "lbalance": initialLBalance, 
        "sbalance": config.short.amountBtc || 0, 
        "lStateData": { "ppc": 0, "ac": 0, "ai": 0, "orderCountInCycle": 0, "lastOrder": null, "pm": 0, "pc": 0, "requiredCoverageAmount": 0, "nextCoveragePrice": 0 },
        "sStateData": { "ppc": 0, "ac": 0, "ai": 0, "orderCountInCycle": 0, "lastOrder": null, "pm": 0, "pc": 0, "requiredCoverageAmount": 0, "nextCoveragePrice": 0 },
        "lcycle": 0, "lnorder": 0, "ltprice": 0,
        "scycle": 0, "snorder": 0, "stprice": 0,
    };
    
    const newAutobot = new Autobot(newBotData);
    await newAutobot.save();
    
    log(`Documento Autobot creado. LBalance inicializado a ${initialLBalance} USDT. Listo para operar.`, 'info');
}

module.exports = {
    resetAndInitializeBot
};