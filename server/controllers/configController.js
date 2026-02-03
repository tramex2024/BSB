// server/controllers/configController.js

const Autobot = require('../models/Autobot'); 
const bitmartService = require('../services/bitmartService'); 
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

        // Recuperamos el estado actual (importante para el Merge)
        let botState = await Autobot.findOne({});
        if (!botState) return res.status(404).json({ success: false, message: "Bot no encontrado." });

        // 1. VALIDACIÓN DE FONDOS
        const { availableUSDT } = await bitmartService.getAvailableTradingBalances();
        
        const assignedUSDT_Long = newConfig.long?.amountUsdt !== undefined ? parseFloat(newConfig.long.amountUsdt) : botState.config.long.amountUsdt;
        const assignedUSDT_Short = newConfig.short?.amountUsdt !== undefined ? parseFloat(newConfig.short.amountUsdt) : botState.config.short.amountUsdt;
        const assignedUSDT_AI = newConfig.ai?.amountUsdt !== undefined ? parseFloat(newConfig.ai.amountUsdt) : (botState.config.ai?.amountUsdt || 0);

        if ((assignedUSDT_Long + assignedUSDT_Short + assignedUSDT_AI) > (availableUSDT + 5)) {
             return res.status(400).json({ success: false, message: `Fondos insuficientes: ${availableUSDT.toFixed(2)} USDT disponibles.` });
        }

        // 2. FUNCIÓN DE AYUDA PARA FUSIÓN
        const mergeValue = (newValue, oldValue, fallback = 0) => {
            if (newValue === undefined || newValue === null || newValue === "") return oldValue;
            const parsed = parseFloat(newValue);
            return isNaN(parsed) ? oldValue : parsed;
        };

        // 3. PREPARACIÓN DE LA ACTUALIZACIÓN
        const update = {
            // LONG
            'config.long.amountUsdt': assignedUSDT_Long,
            'config.long.purchaseUsdt': mergeValue(newConfig.long?.purchaseUsdt, botState.config.long.purchaseUsdt),
            'config.long.price_var': mergeValue(newConfig.long?.price_var, botState.config.long.price_var),
            'config.long.size_var': mergeValue(newConfig.long?.size_var, botState.config.long.size_var),
            'config.long.profit_percent': mergeValue(newConfig.long?.profit_percent, botState.config.long.profit_percent, 1.5),
            'config.long.price_step_inc': mergeValue(newConfig.long?.price_step_inc, botState.config.long.price_step_inc),
            'config.long.stopAtCycle': newConfig.long?.stopAtCycle !== undefined ? !!newConfig.long.stopAtCycle : botState.config.long.stopAtCycle,

            // SHORT
            'config.short.amountUsdt': assignedUSDT_Short,
            'config.short.purchaseUsdt': mergeValue(newConfig.short?.purchaseUsdt, botState.config.short.purchaseUsdt),
            'config.short.price_var': mergeValue(newConfig.short?.price_var, botState.config.short.price_var),
            'config.short.size_var': mergeValue(newConfig.short?.size_var, botState.config.short.size_var),
            'config.short.profit_percent': mergeValue(newConfig.short?.profit_percent, botState.config.short.profit_percent, 1.5),
            'config.short.price_step_inc': mergeValue(newConfig.short?.price_step_inc, botState.config.short.price_step_inc),
            'config.short.stopAtCycle': newConfig.short?.stopAtCycle !== undefined ? !!newConfig.short.stopAtCycle : botState.config.short.stopAtCycle,

            // AI
            'config.ai.amountUsdt': assignedUSDT_AI,
            'config.ai.stopAtCycle': newConfig.ai?.stopAtCycle !== undefined ? !!newConfig.ai.stopAtCycle : (botState.config.ai?.stopAtCycle || false),
            'config.ai.enabled': newConfig.ai?.enabled !== undefined ? !!newConfig.ai.enabled : (botState.config.ai?.enabled || false)
        };

        // Lógica Extra: Si la IA NO tiene una posición abierta (ailastEntryPrice === 0), 
        // actualizamos su balance operativo al nuevo monto asignado.
        if (botState.ailastEntryPrice === 0) {
            update.aibalance = assignedUSDT_AI;
        }

        // 4. PERSISTENCIA ATÓMICA
        const updatedBot = await Autobot.findOneAndUpdate(
            {}, 
            { $set: update }, 
            { new: true, runValidators: true }
        ).lean();

        // 5. SINCRONIZACIÓN DE MOTORES
        if (updatedBot) {
            const lastPrice = autobotLogic.getLastPrice();
            await autobotLogic.syncFrontendState(lastPrice, updatedBot);
        }

        return res.json({ 
            success: true, 
            message: "Configuración sincronizada correctamente.", 
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