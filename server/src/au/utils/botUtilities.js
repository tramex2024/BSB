// BSB/server/src/utils/botUtilities.js

const Autobot = require('../../../models/Autobot'); 
const { log } = require('../../../services/loggerService'); 

/**
 * Función de reseteo total del bot.
 * Preserva configuración, profit y el conteo de ciclos ejecutados.
 * Ahora inicializa todas las siglas raíz para la arquitectura 2026.
 */
async function resetAndInitializeBot() {
    try {
        const currentBot = await Autobot.findOne({});
        
        // --- 1. PRESERVACIÓN DE DATOS HISTÓRICOS ---
        const config = currentBot ? currentBot.config : {}; 
        const totalProfit = currentBot ? (parseFloat(currentBot.total_profit) || 0) : 0; 
        
        // Mantenemos el conteo de ciclos globales de cada estrategia
        const lcycle = currentBot ? (parseInt(currentBot.lcycle) || 0) : 0;
        const scycle = currentBot ? (parseInt(currentBot.scycle) || 0) : 0;

        // Balances iniciales desde config (Acceso seguro a la jerarquía)
        const initialLBalance = config.long?.amountUsdt || 0; 
        const initialSBalance = config.short?.amountUsdt || 0; 

        // --- 2. RE-INICIALIZACIÓN ---
        // Borramos el documento previo para evitar conflictos de esquemas antiguos
        await Autobot.deleteMany({});
        
        const newBotData = {
            "lstate": "STOPPED",
            "sstate": "STOPPED",
            "config": config,
            "total_profit": totalProfit,
            "lcycle": lcycle,
            "scycle": scycle,
            
            "lbalance": initialLBalance, 
            "sbalance": initialSBalance, 

            // --- SIGLAS RAÍZ LONG (Arquitectura Plana) ---
            "lppc": 0,          // Long Price Per Coin (Promedio)
            "lac": 0,           // Long Accumulated Coins (BTC)
            "lai": 0,           // Long Accumulated Investment (USDT)
            "locc": 0,          // Long Order Cycle Count (Para exponencial)
            "llastOrder": null, // Rastro de la orden activa
            "lpm": 0,           // Long Price Max (Para Trailing)
            "lpc": 0,           // Long Price Cut (Stop Loss del Trailing)
            "lrca": 0,          // Long Required Coverage Amount
            "lncp": 0,          // Long Next Coverage Price
            "lstartTime": null, 
            "lnorder": 0,       // Número de orden visual
            "ltprice": 0,       // Long Target Price (Take Profit)
            "lsprice": 0,       // Long Stop Price (Visual)

            // --- SIGLAS RAÍZ SHORT (Arquitectura Plana) ---
            "sppc": 0,          // Short Price Per Coin
            "sac": 0,           // Short Accumulated Coins
            "sai": 0,           // Short Accumulated Investment
            "socc": 0,          // Short Order Cycle Count
            "slastOrder": null, 
            "spm": 0,           // Short Price Min (Para Trailing Short)
            "spc": 0,           // Short Price Cut (Stop de compra)
            "srca": 0,          // Short Required Coverage Amount
            "sncp": 0,          // Short Next Coverage Price
            "sstartTime": null,
            "snorder": 0,
            "stprice": 0,       // Short Target Price
            "sbprice": 0,       // Short Buy Price (Visual)
            
            "updatedAt": new Date()
        };
        
        const newAutobot = new Autobot(newBotData);
        await newAutobot.save();
        
        console.log(`✅ [SYSTEM] Reset completo.`);
        console.log(`📊 Historial Preservado -> Profit: $${totalProfit} | Ciclos L: ${lcycle} | Ciclos S: ${scycle}`);
        
    } catch (error) {
        console.error(`❌ Error en resetAndInitializeBot: ${error.message}`);
    }
}

module.exports = {
    resetAndInitializeBot
};