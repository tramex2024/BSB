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
        const { config: newConfig, applyShield, strategy } = req.body; 
        
        if (!newConfig) return res.status(400).json({ success: false, message: "No se proporcionaron datos." });

        let botState = await Autobot.findOne({ userId });
        if (!botState) return res.status(404).json({ success: false, message: "Bot no inicializado." });

        const lastPrice = autobotLogic.getLastPrice() || 0;

        const secureMerge = (newVal, oldVal) => {
            const parsed = parseFloat(newVal);
            if (newVal === undefined || newVal === null || newVal === "" || isNaN(parsed)) {
                return oldVal;
            }
            return parsed;
        };

        let update = {};

        // --- LÓGICA DE BLINDAJE (PLAN B) ---
        if (applyShield && strategy) {
            const amt = parseFloat(newConfig[strategy]?.amountUsdt);
            
            if (!isNaN(amt)) {
                // Obtenemos el cálculo de los 6 parámetros desde el servicio
                const fullShield = processUserInputs(
                    strategy === 'long' ? amt : botState.config.long.amountUsdt,
                    strategy === 'short' ? amt : botState.config.short.amountUsdt,
                    strategy === 'ai' ? amt : (botState.config.ai?.amountUsdt || 0)
                );

                const s = strategy; 
                const d = fullShield[s]; // Datos calculados (blindaje)

                update[`config.${s}.amountUsdt`] = d.amountUsdt;

                // Solo aplicamos los 6 parámetros si es Long o Short
                if (s !== 'ai') {
                    update[`config.${s}.purchaseUsdt`] = d.purchaseUsdt;
                    update[`config.${s}.price_var`] = d.price_var;
                    update[`config.${s}.size_var`] = d.size_var;
                    update[`config.${s}.price_step_inc`] = d.price_step_inc;
                    update[`config.${s}.profit_percent`] = d.profit_percent; // El 6to parámetro
                }

                // Mantener estados booleanos que no se calculan por blindaje
                update[`config.${s}.stopAtCycle`] = typeof newConfig[s]?.stopAtCycle === 'boolean' 
                    ? newConfig[s].stopAtCycle 
                    : botState.config[s].stopAtCycle;
            }
        } else {
            // --- MODO MANUAL (Pestañas Autobot/Aibot) ---
            if (newConfig.long) {
                update['config.long.amountUsdt'] = secureMerge(newConfig.long.amountUsdt, botState.config.long.amountUsdt);
                update['config.long.purchaseUsdt'] = secureMerge(newConfig.long.purchaseUsdt, botState.config.long.purchaseUsdt);
                update['config.long.price_var'] = secureMerge(newConfig.long.price_var, botState.config.long.price_var);
                update['config.long.size_var'] = secureMerge(newConfig.long.size_var, botState.config.long.size_var);
                update['config.long.profit_percent'] = secureMerge(newConfig.long.profit_percent, botState.config.long.profit_percent);
                update['config.long.price_step_inc'] = secureMerge(newConfig.long.price_step_inc, botState.config.long.price_step_inc);
                if (typeof newConfig.long.stopAtCycle === 'boolean') update['config.long.stopAtCycle'] = newConfig.long.stopAtCycle;
            }
            if (newConfig.short) {
                update['config.short.amountUsdt'] = secureMerge(newConfig.short.amountUsdt, botState.config.short.amountUsdt);
                update['config.short.purchaseUsdt'] = secureMerge(newConfig.short.purchaseUsdt, botState.config.short.purchaseUsdt);
                update['config.short.price_var'] = secureMerge(newConfig.short.price_var, botState.config.short.price_var);
                update['config.short.size_var'] = secureMerge(newConfig.short.size_var, botState.config.short.size_var);
                update['config.short.profit_percent'] = secureMerge(newConfig.short.profit_percent, botState.config.short.profit_percent);
                update['config.short.price_step_inc'] = secureMerge(newConfig.short.price_step_inc, botState.config.short.price_step_inc);
                if (typeof newConfig.short.stopAtCycle === 'boolean') update['config.short.stopAtCycle'] = newConfig.short.stopAtCycle;
            }
            if (newConfig.ai) {
                update['config.ai.amountUsdt'] = secureMerge(newConfig.ai.amountUsdt, botState.config.ai?.amountUsdt || 0);
                if (typeof newConfig.ai.stopAtCycle === 'boolean') update['config.ai.stopAtCycle'] = newConfig.ai.stopAtCycle;
            }
        }

        const updatedBot = await Autobot.findOneAndUpdate(
            { userId }, 
            { $set: update }, 
            { new: true, runValidators: true }
        ).lean();

        if (updatedBot) {
            await autobotLogic.syncFrontendState(lastPrice, updatedBot, userId);
        }

        return res.json({ 
            success: true, 
            message: applyShield ? "Blindaje automático aplicado." : "Configuración manual guardada.",
            data: updatedBot.config 
        });

    } catch (error) {
        console.error("❌ Error en updateBotConfig:", error);
        return res.status(500).json({ success: false, message: "Error interno." });
    }
}

module.exports = { updateBotConfig, getBotConfig };