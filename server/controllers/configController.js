// server/controllers/configController.js
const Autobot = require('../models/Autobot'); 
const autobotLogic = require('../autobotLogic'); 
const { processUserInputs } = require('../services/inputs');

/**
 * Obtiene la configuración actual del bot para el usuario.
 */
async function getBotConfig(req, res) {
    try {
        const userId = req.user.id;
        const botState = await Autobot.findOne({ userId }).lean();
        if (!botState) {
            return res.status(404).json({ success: false, message: "No se encontró configuración." });
        }
        return res.json({ success: true, config: botState.config });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
}

/**
 * Actualiza la configuración aplicando la lógica de Blindaje del 40% (inputs.js).
 */
async function updateBotConfig(req, res) {
    try {
        const userId = req.user.id;
        const { config: newConfig } = req.body; 
        
        if (!newConfig) {
            return res.status(400).json({ success: false, message: "No se proporcionaron datos." });
        }

        let botState = await Autobot.findOne({ userId });
        if (!botState) {
            return res.status(404).json({ success: false, message: "Bot no inicializado." });
        }

        const lastPrice = autobotLogic.getLastPrice() || 0;

        // 1. Obtener montos (Prioridad: Lo que viene del front > Lo que hay en DB)
        const amtL = newConfig.long?.amountUsdt ?? botState.config.long?.amountUsdt ?? 0;
        const amtS = newConfig.short?.amountUsdt ?? botState.config.short?.amountUsdt ?? 0;
        const amtAI = newConfig.ai?.amountUsdt ?? botState.config.ai?.amountUsdt ?? 0;

        // 2. Calcular Blindaje Automático (40% de cobertura mediante services/inputs.js)
        const shield = processUserInputs(amtL, amtS, amtAI);

        // 3. Mezcla segura para campos manuales (profit_percent, stopAtCycle, etc.)
        const secureMerge = (newVal, oldVal) => {
            const parsed = parseFloat(newVal);
            return (newVal === undefined || newVal === null || newVal === "" || isNaN(parsed)) ? oldVal : parsed;
        };

        // 4. Construcción del objeto de actualización con rutas de punto para MongoDB
        const updateData = {
            // LONG
            'config.long.amountUsdt': parseFloat(amtL),
            'config.long.purchaseUsdt': shield.long.purchaseUsdt,
            'config.long.price_var': shield.long.price_var,
            'config.long.size_var': shield.long.size_var,
            'config.long.price_step_inc': shield.long.price_step_inc,
            'config.long.profit_percent': secureMerge(newConfig.long?.profit_percent, botState.config.long.profit_percent),
            'config.long.stopAtCycle': typeof newConfig.long?.stopAtCycle === 'boolean' ? newConfig.long.stopAtCycle : botState.config.long.stopAtCycle,

            // SHORT
            'config.short.amountUsdt': parseFloat(amtS),
            'config.short.purchaseUsdt': shield.short.purchaseUsdt,
            'config.short.price_var': shield.short.price_var,
            'config.short.size_var': shield.short.size_var,
            'config.short.price_step_inc': shield.short.price_step_inc,
            'config.short.profit_percent': secureMerge(newConfig.short?.profit_percent, botState.config.short.profit_percent),
            'config.short.stopAtCycle': typeof newConfig.short?.stopAtCycle === 'boolean' ? newConfig.short.stopAtCycle : botState.config.short.stopAtCycle,

            // AI (Blindaje para asegurar que no falle si el objeto no existe)
            'config.ai.amountUsdt': parseFloat(amtAI),
            'config.ai.purchaseUsdt': shield.ai.purchaseUsdt,
            'config.ai.price_var': shield.ai.price_var,
            'config.ai.size_var': shield.ai.size_var,
            'config.ai.price_step_inc': shield.ai.price_step_inc,
            'config.ai.stopAtCycle': typeof newConfig.ai?.stopAtCycle === 'boolean' ? 
                newConfig.ai.stopAtCycle : (botState.config.ai?.stopAtCycle || false),
            'config.ai.enabled': newConfig.ai?.enabled !== undefined ? 
                newConfig.ai.enabled : (botState.config.ai?.enabled || false)
        };

        // 5. Guardar en MongoDB
        const updatedBot = await Autobot.findOneAndUpdate(
            { userId }, 
            { $set: updateData }, 
            { new: true, runValidators: true }
        ).lean();

        // 6. Sincronizar con el motor en tiempo real (Socket/Orchestrator)
        if (updatedBot) {
            try {
                // El try/catch interno evita que un fallo de socket devuelva un 500 al cliente
                await autobotLogic.syncFrontendState(lastPrice, updatedBot, userId);
            } catch (syncErr) {
                console.error("⚠️ Error no crítico en sincronización de dashboard:", syncErr.message);
            }
        }

        return res.json({ 
            success: true, 
            message: "Blindaje 40% aplicado correctamente.",
            data: updatedBot.config 
        });

    } catch (error) {
        console.error("❌ Error Crítico en updateBotConfig:", error);
        return res.status(500).json({ 
            success: false, 
            message: "Error interno al procesar el blindaje en el servidor." 
        });
    }
}

module.exports = { updateBotConfig, getBotConfig };