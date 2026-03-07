/**
 * BSB/server/controllers/configController.js
 * CONTROLADOR MAESTRO - VERSIÓN BLINDADA (Sincronización de Balance y Configuración)
 */

const Autobot = require('../models/Autobot'); 
const autobotLogic = require('../autobotLogic'); 
const { processUserInputs, processAdvancedInputs } = require('../services/inputs');

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

        // --- LÓGICA DE BLINDAJE (Dashboard / Paso 1) ---
        if (applyShield && strategy) {
            const amt = parseFloat(newConfig[strategy]?.amountUsdt);
            
            if (!isNaN(amt)) {
                const fullShield = processUserInputs(
                    strategy === 'long' ? amt : botState.config.long.amountUsdt,
                    strategy === 'short' ? amt : botState.config.short.amountUsdt,
                    strategy === 'ai' ? amt : (botState.config.ai?.amountUsdt || 0)
                );

                const s = strategy; 
                const d = fullShield[s]; 

                update[`config.${s}.amountUsdt`] = d.amountUsdt;

                // 🟢 SINCRONIZACIÓN DE BALANCE POR ESTADO "STOPPED"
                if (s === 'long' && botState.lstate === 'STOPPED') update.lbalance = d.amountUsdt;
                if (s === 'short' && botState.sstate === 'STOPPED') update.sbalance = d.amountUsdt;
                if (s === 'ai' && botState.aistate === 'STOPPED') update.aibalance = d.amountUsdt;

                if (s !== 'ai') {
                    update[`config.${s}.purchaseUsdt`] = d.purchaseUsdt;
                    update[`config.${s}.price_var`] = d.price_var;
                    update[`config.${s}.size_var`] = d.size_var;
                    update[`config.${s}.price_step_inc`] = d.price_step_inc;
                    update[`config.${s}.profit_percent`] = d.profit_percent;
                }

                update[`config.${s}.stopAtCycle`] = typeof newConfig[s]?.stopAtCycle === 'boolean' 
                    ? newConfig[s].stopAtCycle 
                    : botState.config[s].stopAtCycle;
            }
        } else {
            // --- MODO MANUAL (Pestañas Autobot/Aibot - Paso 3) ---
            
            // 1. Procesar LONG
            if (newConfig.long) {
                const cleanLong = processAdvancedInputs(newConfig.long);
                update['config.long.amountUsdt'] = cleanLong.amountUsdt;
                update['config.long.purchaseUsdt'] = cleanLong.purchaseUsdt;
                update['config.long.price_var'] = cleanLong.price_var;
                update['config.long.size_var'] = cleanLong.size_var;
                update['config.long.profit_percent'] = cleanLong.profit_percent;
                update['config.long.price_step_inc'] = cleanLong.price_step_inc;
                update['config.long.stopAtCycle'] = cleanLong.stopAtCycle;

                // Sincronizar solo si este es el lado que se está editando (strategy) o si viene solo
                if (botState.lstate === 'STOPPED' && (!strategy || strategy === 'long')) {
                    update.lbalance = cleanLong.amountUsdt;
                }
            }

            // 2. Procesar SHORT
            if (newConfig.short) {
                const cleanShort = processAdvancedInputs(newConfig.short);
                update['config.short.amountUsdt'] = cleanShort.amountUsdt;
                update['config.short.purchaseUsdt'] = cleanShort.purchaseUsdt;
                update['config.short.price_var'] = cleanShort.price_var;
                update['config.short.size_var'] = cleanShort.size_var;
                update['config.short.profit_percent'] = cleanShort.profit_percent;
                update['config.short.price_step_inc'] = cleanShort.price_step_inc;
                update['config.short.stopAtCycle'] = cleanShort.stopAtCycle;

                if (botState.sstate === 'STOPPED' && (!strategy || strategy === 'short')) {
                    update.sbalance = cleanShort.amountUsdt;
                }
            }

            // 3. Procesar AI
            if (newConfig.ai) {
                const newAmt = secureMerge(newConfig.ai.amountUsdt, botState.config.ai?.amountUsdt || 0);
                update['config.ai.amountUsdt'] = newAmt;
                if (botState.aistate === 'STOPPED' && (!strategy || strategy === 'ai')) {
                    update.aibalance = newAmt;
                }
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
            message: applyShield ? "Blindaje aplicado y balances sincronizados." : "Configuración y balances actualizados.",
            data: updatedBot.config 
        });

    } catch (error) {
        console.error("❌ Error en updateBotConfig:", error);
        return res.status(500).json({ success: false, message: "Error interno." });
    }
}

module.exports = { updateBotConfig, getBotConfig };