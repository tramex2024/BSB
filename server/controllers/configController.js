/**
 * BSB/server/controllers/configController.js
 * GESTIÓN DE CONFIGURACIÓN POR USUARIO
 */

const Autobot = require('../models/Autobot'); 
const bitmartService = require('../services/bitmartService'); 
const autobotLogic = require('../autobotLogic'); 

/**
 * Obtiene la configuración específica del usuario autenticado
 */
async function getBotConfig(req, res) {
    try {
        const userId = req.user.id; // Extraído del token JWT
        const botState = await Autobot.findOne({ userId }).lean();
        
        if (!botState) {
            return res.status(404).json({ success: false, message: "No se encontró configuración para este usuario." });
        }
        
        return res.json({ success: true, config: botState.config });
    } catch (error) {
        console.error("❌ Error en getBotConfig:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
}

/**
 * Actualiza la configuración, valida fondos en BitMart y sincroniza motores
 */
async function updateBotConfig(req, res) {
    try {
        const userId = req.user.id;
        const { config: newConfig } = req.body; 
        
        if (!newConfig) {
            return res.status(400).json({ success: false, message: "No se proporcionaron datos de configuración." });
        }

        // 1. RECUPERAR ESTADO Y VALIDAR FONDOS REALES
        let botState = await Autobot.findOne({ userId });
        if (!botState) return res.status(404).json({ success: false, message: "Bot no inicializado para este usuario." });

        // IMPORTANTE: Pasamos req.bitmartCreds (inyectadas por el middleware)
        const { availableUSDT } = await bitmartService.getAvailableTradingBalances(req.bitmartCreds);
        
        const assignedUSDT_Long = newConfig.long?.amountUsdt !== undefined ? parseFloat(newConfig.long.amountUsdt) : botState.config.long.amountUsdt;
        const assignedUSDT_Short = newConfig.short?.amountUsdt !== undefined ? parseFloat(newConfig.short.amountUsdt) : botState.config.short.amountUsdt;
        const assignedUSDT_AI = newConfig.ai?.amountUsdt !== undefined ? parseFloat(newConfig.ai.amountUsdt) : (botState.config.ai?.amountUsdt || 0);

        // Validación de margen (tolerancia de 5 USDT por fluctuaciones)
        if ((assignedUSDT_Long + assignedUSDT_Short + assignedUSDT_AI) > (availableUSDT + 5)) {
             return res.status(400).json({ 
                 success: false, 
                 message: `Fondos insuficientes en BitMart. Tienes ${availableUSDT.toFixed(2)} USDT y el bot requiere ${(assignedUSDT_Long + assignedUSDT_Short + assignedUSDT_AI).toFixed(2)}.` 
             });
        }

        // 2. FUNCIÓN DE AYUDA PARA MERGE (Limpia valores nulos/vacíos)
        const mergeValue = (newValue, oldValue) => {
            if (newValue === undefined || newValue === null || newValue === "") return oldValue;
            const parsed = parseFloat(newValue);
            return isNaN(parsed) ? oldValue : parsed;
        };

        // 3. PREPARACIÓN DE LA ACTUALIZACIÓN SEGMENTADA
        const update = {
            'config.long.amountUsdt': assignedUSDT_Long,
            'config.long.purchaseUsdt': mergeValue(newConfig.long?.purchaseUsdt, botState.config.long.purchaseUsdt),
            'config.long.price_var': mergeValue(newConfig.long?.price_var, botState.config.long.price_var),
            'config.long.size_var': mergeValue(newConfig.long?.size_var, botState.config.long.size_var),
            'config.long.profit_percent': mergeValue(newConfig.long?.profit_percent, botState.config.long.profit_percent),
            'config.long.price_step_inc': mergeValue(newConfig.long?.price_step_inc, botState.config.long.price_step_inc),
            'config.long.stopAtCycle': newConfig.long?.stopAtCycle !== undefined ? !!newConfig.long.stopAtCycle : botState.config.long.stopAtCycle,

            'config.short.amountUsdt': assignedUSDT_Short,
            'config.short.purchaseUsdt': mergeValue(newConfig.short?.purchaseUsdt, botState.config.short.purchaseUsdt),
            'config.short.price_var': mergeValue(newConfig.short?.price_var, botState.config.short.price_var),
            'config.short.size_var': mergeValue(newConfig.short?.size_var, botState.config.short.size_var),
            'config.short.profit_percent': mergeValue(newConfig.short?.profit_percent, botState.config.short.profit_percent),
            'config.short.price_step_inc': mergeValue(newConfig.short?.price_step_inc, botState.config.short.price_step_inc),
            'config.short.stopAtCycle': newConfig.short?.stopAtCycle !== undefined ? !!newConfig.short.stopAtCycle : botState.config.short.stopAtCycle,

            'config.ai.amountUsdt': assignedUSDT_AI,
            'config.ai.stopAtCycle': newConfig.ai?.stopAtCycle !== undefined ? !!newConfig.ai.stopAtCycle : (botState.config.ai?.stopAtCycle || false),
            'config.ai.enabled': newConfig.ai?.enabled !== undefined ? !!newConfig.ai.enabled : (botState.config.ai?.enabled || false)
        };

        // Si la IA no está en una operación activa, actualizamos su balance de trabajo
        if ((botState.ailastEntryPrice || 0) === 0) {
            update.aibalance = assignedUSDT_AI;
        }

        // 4. PERSISTENCIA ATÓMICA POR USUARIO
        const updatedBot = await Autobot.findOneAndUpdate(
            { userId }, 
            { $set: update }, 
            { new: true, runValidators: true }
        ).lean();

        // 5. SINCRONIZACIÓN CON EL MOTOR EN MEMORIA
        if (updatedBot) {
            const lastPrice = autobotLogic.getLastPrice();
            // syncFrontendState ahora debe manejar el userId internamente
            await autobotLogic.syncFrontendState(lastPrice, updatedBot, userId);
        }

        return res.json({ 
            success: true, 
            message: "Configuración actualizada y sincronizada.", 
            data: updatedBot.config 
        });

    } catch (error) {
        console.error("❌ Error en updateBotConfig:", error);
        return res.status(500).json({ success: false, message: "Error interno al actualizar la configuración." });
    }
}

module.exports = { 
    updateBotConfig, 
    getBotConfig 
};