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

        // --- PUNTO 1: USAR DATOS DE LA DB (SIN LLAMAR A BITMART) ---
        const availUSDT = botState.lastAvailableUSDT || 0;
        const availBTC = botState.lastAvailableBTC || 0;

        // --- PUNTO 2 Y 3: LÓGICA DE VALIDACIÓN DE FONDOS Y COBERTURA BTC ---
        
        // 1. Validar LONG y AI (Dependen de USDT libre + lo que ya tienen comprado)
        const newLongTotal = parseFloat(newConfig.long?.amountUsdt || botState.config.long.amountUsdt);
        const newAiTotal = parseFloat(newConfig.ai?.amountUsdt || botState.config.ai?.amountUsdt || 0);
        
        // El bot ya tiene invertido (comprado): botState.lbalance y botState.aibalance
        const neededUSDT = (newLongTotal - botState.lbalance) + (newAiTotal - botState.aibalance);

        if (neededUSDT > (availUSDT + 5)) {
            return res.status(400).json({ 
                success: false, 
                message: `USDT insuficientes en DB. Necesitas ${neededUSDT.toFixed(2)} más, tienes ${availUSDT.toFixed(2)}.` 
            });
        }

        // 2. Validar SHORT (Depende de BTC disponible para vender)
        const newShortTotalUsdt = parseFloat(newConfig.short?.amountUsdt || botState.config.short.amountUsdt);
        const alreadySoldUsdt = botState.sbalance || 0; // Lo que ya vendió el short
        
        // ¿Cuántos USDT faltan por vender en BTC?
        const remainingShortUsdt = newShortTotalUsdt - alreadySoldUsdt;
        
        if (remainingShortUsdt > 0 && lastPrice > 0) {
            const btcNeededForShort = remainingShortUsdt / lastPrice;
            // Si el BTC en DB es menor a lo que falta por vender para completar el ciclo...
            if (availBTC < btcNeededForShort) {
                return res.status(400).json({
                    success: false,
                    message: `BTC insuficientes para Short. Requieres ${btcNeededForShort.toFixed(5)} BTC, tienes ${availBTC.toFixed(5)} en DB.`
                });
            }
        }

        // --- PROCESO DE ACTUALIZACIÓN ---
        const mergeValue = (n, o) => (n === undefined || n === null || n === "") ? o : parseFloat(n);

        const update = {
            'config.long.amountUsdt': newLongTotal,
            'config.long.purchaseUsdt': mergeValue(newConfig.long?.purchaseUsdt, botState.config.long.purchaseUsdt),
            'config.long.price_var': mergeValue(newConfig.long?.price_var, botState.config.long.price_var),
            'config.long.size_var': mergeValue(newConfig.long?.size_var, botState.config.long.size_var),
            'config.long.profit_percent': mergeValue(newConfig.long?.profit_percent, botState.config.long.profit_percent),
            'config.long.price_step_inc': mergeValue(newConfig.long?.price_step_inc, botState.config.long.price_step_inc),
            'config.long.stopAtCycle': !!(newConfig.long?.stopAtCycle ?? botState.config.long.stopAtCycle),

            'config.short.amountUsdt': newShortTotalUsdt,
            'config.short.purchaseUsdt': mergeValue(newConfig.short?.purchaseUsdt, botState.config.short.purchaseUsdt),
            'config.short.price_var': mergeValue(newConfig.short?.price_var, botState.config.short.price_var),
            'config.short.size_var': mergeValue(newConfig.short?.size_var, botState.config.short.size_var),
            'config.short.profit_percent': mergeValue(newConfig.short?.profit_percent, botState.config.short.profit_percent),
            'config.short.price_step_inc': mergeValue(newConfig.short?.price_step_inc, botState.config.short.price_step_inc),
            'config.short.stopAtCycle': !!(newConfig.short?.stopAtCycle ?? botState.config.short.stopAtCycle),

            'config.ai.amountUsdt': newAiTotal,
            'config.ai.stopAtCycle': !!(newConfig.ai?.stopAtCycle ?? botState.config.ai?.stopAtCycle)
        };

        // Ajuste de balance operativo para AI si no ha entrado aún
        if ((botState.ailastEntryPrice || 0) === 0) update.aibalance = newAiTotal;

        const updatedBot = await Autobot.findOneAndUpdate(
            { userId }, { $set: update }, { new: true, runValidators: true }
        ).lean();

        if (updatedBot) {
            await autobotLogic.syncFrontendState(lastPrice, updatedBot, userId);
        }

        return res.json({ success: true, message: "Sincronizado con éxito", data: updatedBot.config });

    } catch (error) {
        console.error("❌ Error en updateBotConfig:", error);
        return res.status(500).json({ success: false, message: "Error interno de servidor." });
    }
}

module.exports = { updateBotConfig, getBotConfig };