// server/controllers/configController.js

const Autobot = require('../models/Autobot'); 
const bitmartService = require('../services/bitmartService'); 
const { calculateLongCoverage, parseNumber } = require('../autobotCalculations'); 
const autobotLogic = require('../autobotLogic'); 

/**
 * Obtiene la configuración actual para el frontend
 */
async function getBotConfig(req, res) {
    try {
        const botState = await Autobot.findOne({}).lean();
        if (!botState) {
            return res.status(404).json({ success: false, message: "No se encontró la configuración del bot." });
        }
        return res.json({ success: true, config: botState.config });
    } catch (error) {
        console.error("❌ Error en getBotConfig:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
}

/**
 * Actualiza la configuración y sincroniza con el motor
 */
async function updateBotConfig(req, res) {
    try {
        const { config: newConfig } = req.body; 
        if (!newConfig) {
            return res.status(400).json({ success: false, message: "No configuration data provided." });
        }

        let botState = await Autobot.findOne({});
        if (!botState) return res.status(404).json({ success: false, message: "Bot no encontrado." });

        // 1. VALIDACIÓN DE FONDOS
        const { availableUSDT } = await bitmartService.getAvailableTradingBalances();
        const assignedUSDT_Long = parseFloat(newConfig.long?.amountUsdt || 0);
        const assignedUSDT_Short = parseFloat(newConfig.short?.amountUsdt || 0);
        
        if ((assignedUSDT_Long + assignedUSDT_Short) > (availableUSDT + 5)) {
             return res.status(400).json({ success: false, message: `Fondos insuficientes: ${availableUSDT.toFixed(2)} USDT disponibles.` });
        }

        // 2. ACTUALIZACIÓN DE CONFIGURACIÓN (Mapeo exacto con Schema)
        const update = {
            'config.long.amountUsdt': assignedUSDT_Long,
            'config.long.purchaseUsdt': parseFloat(newConfig.long?.purchaseUsdt || 0),
            'config.long.price_var': parseFloat(newConfig.long?.price_var || 0),
            'config.long.size_var': parseFloat(newConfig.long?.size_var || 0),
            'config.long.profit_percent': parseFloat(newConfig.long?.profit_percent || 1.5),
            'config.long.price_step_inc': parseFloat(newConfig.long?.price_step_inc || 0),
            'config.long.stopAtCycle': !!newConfig.long?.stopAtCycle,

            'config.short.amountUsdt': assignedUSDT_Short,
            'config.short.purchaseUsdt': parseFloat(newConfig.short?.purchaseUsdt || 0),
            'config.short.price_var': parseFloat(newConfig.short?.price_var || 0),
            'config.short.size_var': parseFloat(newConfig.short?.size_var || 0),
            'config.short.profit_percent': parseFloat(newConfig.short?.profit_percent || 1.5),
            'config.short.price_step_inc': parseFloat(newConfig.short?.price_step_inc || 0),
            'config.short.stopAtCycle': !!newConfig.short?.stopAtCycle
        };

        // 3. PERSISTENCIA ATÓMICA
        const updatedBot = await Autobot.findOneAndUpdate(
            {}, 
            { $set: update }, 
            { new: true, runValidators: true }
        ).lean();

        // 4. SINCRONIZACIÓN INMEDIATA DEL SOCKET
        if (updatedBot) {
            await autobotLogic.syncFrontendState(null, updatedBot);
        }

        return res.json({ 
            success: true, 
            message: "Configuración guardada y motor sincronizado.", 
            data: updatedBot.config 
        });

    } catch (error) {
        console.error("❌ Error en updateBotConfig:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
}

module.exports = { 
    updateBotConfig, 
    getBotConfig 
};