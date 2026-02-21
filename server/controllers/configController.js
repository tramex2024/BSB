const Autobot = require('../models/Autobot'); 
const autobotLogic = require('../autobotLogic'); 

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

        // --- 1. PRE-CÁLCULO DE VALIDACIÓN (SOLO PARA INFO) ---
        const availUSDT = botState.lastAvailableUSDT || 0;
        const availBTC = botState.lastAvailableBTC || 0;
        
        const newLongTotal = parseFloat(newConfig.long?.amountUsdt || botState.config.long.amountUsdt);
        const newAiTotal = parseFloat(newConfig.ai?.amountUsdt || botState.config.ai?.amountUsdt || 0);
        const neededUSDT = (newLongTotal - botState.lbalance) + (newAiTotal - botState.aibalance);

        // Ya no hacemos "return" si falta saldo. Solo calculamos para el log o respuesta.
        const hasEnoughUSDT = (neededUSDT <= (availUSDT + 5));

        // --- 2. SISTEMA DE MEZCLA SEGURA ---
        const secureMerge = (newVal, oldVal, minLimit = 0.1) => {
            const parsed = parseFloat(newVal);
            // Si el campo está vacío o es inválido, mantenemos el valor anterior de la DB
            if (newVal === undefined || newVal === null || newVal === "" || isNaN(parsed)) {
                return oldVal;
            }
            return parsed;
        };

        const update = {
            'config.long.amountUsdt': newLongTotal,
            'config.long.purchaseUsdt': secureMerge(newConfig.long?.purchaseUsdt, botState.config.long.purchaseUsdt, 1),
            'config.long.price_var': secureMerge(newConfig.long?.price_var, botState.config.long.price_var, 0.01),
            'config.long.size_var': secureMerge(newConfig.long?.size_var, botState.config.long.size_var, 0.01),
            'config.long.profit_percent': secureMerge(newConfig.long?.profit_percent, botState.config.long.profit_percent, 0.01),
            'config.long.price_step_inc': secureMerge(newConfig.long?.price_step_inc, botState.config.long.price_step_inc, 0),
            'config.long.stopAtCycle': typeof newConfig.long?.stopAtCycle === 'boolean' ? newConfig.long.stopAtCycle : botState.config.long.stopAtCycle,

            'config.short.amountUsdt': secureMerge(newConfig.short?.amountUsdt, botState.config.short.amountUsdt, 1),
            'config.short.purchaseUsdt': secureMerge(newConfig.short?.purchaseUsdt, botState.config.short.purchaseUsdt, 1),
            'config.short.price_var': secureMerge(newConfig.short?.price_var, botState.config.short.price_var, 0.01),
            'config.short.size_var': secureMerge(newConfig.short?.size_var, botState.config.short.size_var, 0.01),
            'config.short.profit_percent': secureMerge(newConfig.short?.profit_percent, botState.config.short.profit_percent, 0.01),
            'config.short.price_step_inc': secureMerge(newConfig.short?.price_step_inc, botState.config.short.price_step_inc, 0),
            'config.short.stopAtCycle': typeof newConfig.short?.stopAtCycle === 'boolean' ? newConfig.short.stopAtCycle : botState.config.short.stopAtCycle,

            'config.ai.amountUsdt': newAiTotal,
            'config.ai.stopAtCycle': typeof newConfig.ai?.stopAtCycle === 'boolean' ? newConfig.ai.stopAtCycle : botState.config.ai?.stopAtCycle
        };

        // --- 3. GUARDADO INCONDICIONAL ---
        const updatedBot = await Autobot.findOneAndUpdate(
            { userId }, 
            { $set: update }, 
            { new: true, runValidators: true }
        ).lean();

        // Sincronizar con el motor de trading
        if (updatedBot) {
            await autobotLogic.syncFrontendState(lastPrice, updatedBot, userId);
        }

        return res.json({ 
            success: true, 
            message: hasEnoughUSDT ? "Configuración guardada." : "Guardado, pero saldo insuficiente para operar.",
            data: updatedBot.config 
        });

    } catch (error) {
        console.error("❌ Error en updateBotConfig:", error);
        return res.status(500).json({ success: false, message: "Error interno." });
    }
}

module.exports = { updateBotConfig, getBotConfig };