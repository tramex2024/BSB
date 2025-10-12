// BSB/server/src/states/long/LStopped.js

const Autobot = require('../../../models/Autobot');

// 💡 SOLUCIÓN: Definir el objeto base AQUÍ para asegurar que esté disponible.
const CLEAN_AUTOBOT_DOCUMENT_BASE = {
    // ESTADOS GLOBALES:
    "lstate": "STOPPED",
    "sstate": "STOPPED",
    
    // CONFIGURACIÓN: (Asegúrate que esta es la configuración base que quieres)
    "config": {
      "symbol": "BTC_USDT",
      "long": { 
        "amountUsdt": 15, "purchaseUsdt": 5, "price_var": 1, 
        "size_var": 100, "enabled": false, "profit_percent": 1 
      },
      "short": { 
        "amountBtc": 0.00004, "sellBtc": 0.00005, "price_var": 1, 
        "size_var": 100, "enabled": false, "profit_percent": 1 
      },
      "stopAtCycle": false
    },

    // DATOS DE ESTADO LONG (LStateData) - ¡Todos a cero!
    "lStateData": {
        "ppc": 0, "ac": 0, "ppv": 0, "av": 0, "orderCountInCycle": 0,
        "lastOrder": null, "pm": 0, "pc": 0, // <-- Cero garantizado
        "requiredCoverageAmount": 0, "nextCoveragePrice": 0,
    },
    
    // DATOS DE ESTADO SHORT (SStateData) - ¡Todos a cero!
    "sStateData": {
        "ppc": 0, "ac": 0, "ppv": 0, "av": 0, "orderCountInCycle": 0,
        "lastOrder": null, "pm": 0, "pc": 0, // <-- Cero garantizado
        "requiredCoverageAmount": 0, "nextCoveragePrice": 0,
    },
    
    // BALANCE Y CONTADORES GENERALES - ¡Todos a cero!
    "lbalance": 0, "lcoverage": 0, "lcycle": 0, "lnorder": 0, "ltprice": 0,
    "sbalance": 0, "scoverage": 0, "scycle": 0, "snorder": 0, "stprice": 0,
    
    "totalProfit": 10000 
};


/**
 * Resetea el documento completo de forma agresiva (Borrar y Recrear).
 * Esta función ya no requiere 'updateGeneralBotState' porque recrea el documento.
 */
async function resetLState(log) {
    // 1. OBTENER CONFIGURACIÓN ACTUAL (Para no perder los settings del usuario)
    const currentBot = await Autobot.findOne({}); 

    // 2. ELIMINAR el documento existente
    await Autobot.deleteMany({});
    log('Documento Autobot eliminado completamente.', 'error');
    
    // 3. CREAR un nuevo documento limpio
    let newBotData = { ...CLEAN_AUTOBOT_DOCUMENT_BASE };
    
    // Preservar la configuración y el profit de la versión antigua si existe
    if (currentBot) {
        // Preserva la configuración de trading establecida por el usuario
        newBotData.config = currentBot.config; 
        // Preserva el total de ganancias
        newBotData.totalProfit = currentBot.totalProfit; 
    }
    
    const newAutobot = new Autobot(newBotData);
    await newAutobot.save();
    
    log('Documento Autobot creado de nuevo con todos los estados reseteados a cero.', 'info');
}


async function run(dependencies) {
    // Solo se necesita 'log' de las dependencias
    const { log } = dependencies; 
    
    log("Estado Long: STOPPED. Deteniendo el monitoreo y reseteando posición...", 'info');
    
    await resetLState(log); 
}

module.exports = { 
    run,
    resetLState
};