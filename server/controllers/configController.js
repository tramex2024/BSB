// server/controllers/configController.js

const Autobot = require('../models/Autobot'); 
const bitmartService = require('../services/bitmartService'); 
const { calculateLongCoverage, parseNumber } = require('../autobotCalculations'); 

/**
 * Maneja la actualización de la configuración del bot.
 */
async function updateBotConfig(req, res) {
    try {
        const { config: newConfig } = req.body; 
        
        if (!newConfig) {
            return res.status(400).json({ success: false, message: "No configuration data provided." });
        }

        console.log("--- SINCRONIZACIÓN DE CONFIGURACIÓN (Mapeo de Esquema) ---");

        let botState = await Autobot.findOne({});
        if (!botState) {
            return res.status(404).json({ success: false, message: "No se encontró el estado del bot." });
        }

        // 1. PERSISTENCIA DE INTERRUPTORES (Prioridad)
        if (newConfig.long) {
            botState.config.long.stopAtCycle = !!newConfig.long.stopAtCycle;
        }
        if (newConfig.short) {
            botState.config.short.stopAtCycle = !!newConfig.short.stopAtCycle;
        }

        // Guardado preventivo de booleanos
        botState.markModified('config.long');
        botState.markModified('config.short');
        await botState.save(); 

        // 2. VALIDACIÓN DE FONDOS REALES
        const { availableUSDT } = await bitmartService.getAvailableTradingBalances();
        const assignedUSDT_Long = parseFloat(newConfig.long?.amountUsdt || 0);
        const assignedUSDT_Short = parseFloat(newConfig.short?.amountUsdt || 0);
        const totalRequiredUSDT = assignedUSDT_Long + assignedUSDT_Short;

        if (totalRequiredUSDT > availableUSDT) {
            console.warn("⚠️ Balance insuficiente en Exchange para actualizar montos.");
            return res.json({ 
                success: true, 
                message: `Checkboxes guardados. Pero la asignación (${totalRequiredUSDT} USDT) excede tu balance real (${availableUSDT.toFixed(2)} USDT).` 
            });
        }

        // 3. ACTUALIZACIÓN DE PARÁMETROS (Alineado con Mongoose)
        if (botState.lstate === 'STOPPED') botState.lbalance = assignedUSDT_Long;
        if (botState.sstate === 'STOPPED') botState.sbalance = assignedUSDT_Short;

        botState.config.symbol = newConfig.symbol || "BTC_USDT";
        
        // --- MAPEO LONG ---
        botState.config.long.amountUsdt = assignedUSDT_Long;
        botState.config.long.purchaseUsdt = parseFloat(newConfig.long?.purchaseUsdt || 0);
        botState.config.long.price_var = parseFloat(newConfig.long?.price_var || 0);
        botState.config.long.size_var = parseFloat(newConfig.long?.size_var || 0);
        botState.config.long.profit_percent = parseFloat(newConfig.long?.profit_percent || 1.5); // ✅ Corregido (antes: trigger)
        botState.config.long.price_step_inc = parseFloat(newConfig.long?.price_step_inc || 0);    // ✅ Añadido (estaba faltando)

        // --- MAPEO SHORT ---
        botState.config.short.amountUsdt = assignedUSDT_Short;
        botState.config.short.purchaseUsdt = parseFloat(newConfig.short?.purchaseUsdt || 0);
        botState.config.short.price_var = parseFloat(newConfig.short?.price_var || 0);
        botState.config.short.size_var = parseFloat(newConfig.short?.size_var || 0);
        botState.config.short.profit_percent = parseFloat(newConfig.short?.profit_percent || 1.5); // ✅ Corregido
        botState.config.short.price_step_inc = parseFloat(newConfig.short?.price_step_inc || 0);    // ✅ Añadido

        // 4. RECÁLCULO DE COBERTURA
        const referencePriceL = (botState.lppc || 0) > 0 ? botState.lppc : 1;
        const { coveragePrice: covL, numberOfOrders: numL } = calculateLongCoverage(
            botState.lbalance,
            referencePriceL,
            botState.config.long.purchaseUsdt,
            botState.config.long.price_var / 100,
            botState.config.long.size_var / 100
        );

        botState.lcoverage = covL;
        botState.lnorder = numL;

        // 5. PERSISTENCIA FINAL
        botState.markModified('config.long');
        botState.markModified('config.short');
        botState.markModified('config');
        
        await botState.save();

        console.log("✅ Configuración sincronizada y guardada en MongoDB.");

        return res.json({ 
            success: true, 
            message: "Configuración actualizada correctamente.",
            data: botState 
        });

    } catch (error) {
        console.error("❌ Error Crítico en updateBotConfig:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
}

async function getBotConfig(req, res) {
    try {
        const botState = await Autobot.findOne({});
        if (!botState) return res.status(404).json({ success: false, message: "No se encontró configuración." });
        res.json({ success: true, config: botState.config });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}

module.exports = { updateBotConfig, getBotConfig };