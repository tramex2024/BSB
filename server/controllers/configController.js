const Autobot = require('../models/Autobot'); 
const autobotLogic = require('../autobotLogic'); 
const { processUserInputs } = require('../services/inputs');

async function getBotConfig(req, res) {
    try {
        const userId = req.user.id;
        const botState = await Autobot.findOne({ userId }).lean();
        if (!botState) return res.status(404).json({ success: false, message: "No se encontró configuración." });
        return res.json({ success: true, config: botState.config });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
}

async function updateBotConfig(req, res) {
    try {
        const userId = req.user.id;
        const { config: newConfig } = req.body; 
        if (!newConfig) return res.status(400).json({ success: false, message: "No se proporcionaron datos." });

        let botState = await Autobot.findOne({ userId });
        if (!botState) return res.status(404).json({ success: false, message: "Bot no inicializado." });

        const lastPrice = autobotLogic.getLastPrice() || 0;

        // --- 1. PROCESAMIENTO DE BLINDAJE AUTOMÁTICO ---
        // Tomamos los montos nuevos o los actuales si no vienen en el request
        const amtL = newConfig.long?.amountUsdt || botState.config.long.amountUsdt;
        const amtS = newConfig.short?.amountUsdt || botState.config.short.amountUsdt;
        const amtAI = newConfig.ai?.amountUsdt || botState.config.ai?.amountUsdt || 0;

        // El motor genera la configuración técnica para cubrir el 40%
        const shield = processUserInputs(amtL, amtS, amtAI);

        // --- 2. SISTEMA DE MEZCLA SEGURA ---
        const secureMerge = (newVal, oldVal) => {
            const parsed = parseFloat(newVal);
            return (newVal === undefined || newVal === null || newVal === "" || isNaN(parsed)) ? oldVal : parsed;
        };

        const update = {
            // LONG BLINDADO
            'config.long.amountUsdt': parseFloat(amtL),
            'config.long.purchaseUsdt': shield.long.purchaseUsdt,
            'config.long.price_var': shield.long.price_var,
            'config.long.size_var': shield.long.size_var,
            'config.long.price_step_inc': shield.long.price_step_inc,
            'config.long.profit_percent': secureMerge(newConfig.long?.profit_percent, botState.config.long.profit_percent),
            'config.long.stopAtCycle': typeof newConfig.long?.stopAtCycle === 'boolean' ? newConfig.long.stopAtCycle : botState.config.long.stopAtCycle,

            // SHORT BLINDADO
            'config.short.amountUsdt': parseFloat(amtS),
            'config.short.purchaseUsdt': shield.short.purchaseUsdt,
            'config.short.price_var': shield.short.price_var,
            'config.short.size_var': shield.short.size_var,
            'config.short.price_step_inc': shield.short.price_step_inc,
            'config.short.profit_percent': secureMerge(newConfig.short?.profit_percent, botState.config.short.profit_percent),
            'config.short.stopAtCycle': typeof newConfig.short?.stopAtCycle === 'boolean' ? newConfig.short.stopAtCycle : botState.config.short.stopAtCycle,

            // AI BLINDADA (Ahora también usa DCA de seguridad)
            'config.ai.amountUsdt': parseFloat(amtAI),
            'config.ai.purchaseUsdt': shield.ai.purchaseUsdt,
            'config.ai.price_var': shield.ai.price_var,
            'config.ai.size_var': shield.ai.size_var,
            'config.ai.price_step_inc': shield.ai.price_step_inc,
            'config.ai.stopAtCycle': typeof newConfig.ai?.stopAtCycle === 'boolean' ? newConfig.ai.stopAtCycle : botState.config.ai?.stopAtCycle
        };

        // --- 3. GUARDADO Y SINCRONIZACIÓN ---
        const updatedBot = await Autobot.findOneAndUpdate(
            { userId }, 
            { $set: update }, 
            { new: true, runValidators: true }
        ).lean();

        if (updatedBot) {
            await autobotLogic.syncFrontendState(lastPrice, updatedBot, userId);
        }

        // Validación de saldo para respuesta
        const neededUSDT = (update['config.long.amountUsdt'] - botState.lbalance) + (update['config.ai.amountUsdt'] - botState.aibalance);
        const hasEnoughUSDT = (neededUSDT <= (botState.lastAvailableUSDT + 5));

        return res.json({ 
            success: true, 
            message: hasEnoughUSDT ? "Estrategia blindada (40%) activa." : "Configuración aplicada, verifique su saldo.",
            data: updatedBot.config 
        });

    } catch (error) {
        console.error("❌ Error en updateBotConfig:", error);
        return res.status(500).json({ success: false, message: "Error interno en el blindaje." });
    }
}

module.exports = { updateBotConfig, getBotConfig };