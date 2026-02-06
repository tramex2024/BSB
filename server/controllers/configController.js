// server/controllers/configController.js

const Autobot = require('../models/Autobot'); 
const bitmartService = require('../services/bitmartService'); 
const { calculateLongCoverage, parseNumber } = require('../autobotCalculations'); 

/**
 * Maneja la actualización de la configuración del bot.
 * Se ha priorizado el guardado de stopAtCycle para evitar conflictos de UI.
 */
async function updateBotConfig(req, res) {
    try {
        // Extraemos 'config' del body enviado por apiService.js
        const { config: newConfig } = req.body; 
        
        if (!newConfig) {
            return res.status(400).json({ success: false, message: "No configuration data provided." });
        }

        console.log("--- ACTUALIZACIÓN DE CONFIGURACIÓN (Lógica Exponencial) ---");

        let botState = await Autobot.findOne({});
        if (!botState) {
            return res.status(404).json({ success: false, message: "No se encontró el estado del bot." });
        }

        // 1. PRIORIDAD: Actualizar StopAtCycle (Booleanos)
        // Esto se hace antes de las validaciones de balance para evitar que la UI "rebote"
        if (newConfig.long) {
            botState.config.long.stopAtCycle = !!newConfig.long.stopAtCycle;
        }
        if (newConfig.short) {
            botState.config.short.stopAtCycle = !!newConfig.short.stopAtCycle;
        }

        // Marcar cambios y guardar preliminarmente los interruptores
        botState.markModified('config.long');
        botState.markModified('config.short');
        await botState.save(); 
        
        console.log("📍 Estados StopAtCycle persistidos en DB.");

        // 2. Obtener saldos reales de BitMart para validación de montos
        const { availableUSDT } = await bitmartService.getAvailableTradingBalances();

        // 3. Asignaciones
        const assignedUSDT_Long = parseFloat(newConfig.long?.amountUsdt || 0);
        const assignedUSDT_Short = parseFloat(newConfig.short?.amountUsdt || 0);
        const totalRequiredUSDT = assignedUSDT_Long + assignedUSDT_Short;

        // 4. Validación de fondos
        // Si falla, devolvemos success: true porque los checkboxes SÍ se guardaron arriba
        if (totalRequiredUSDT > availableUSDT) {
            console.warn("⚠️ Validación de balance fallida, pero se mantuvieron los checkboxes.");
            return res.json({ 
                success: true, 
                message: `Checkboxes guardados. Sin embargo, la asignación total (${totalRequiredUSDT} USDT) excede el balance real (${availableUSDT.toFixed(2)} USDT). Los montos no fueron actualizados.` 
            });
        }

        // 5. Aplicar el resto de cambios si el balance es correcto
        // Actualizar balances raíz solo si el bot está detenido
        if (botState.lstate === 'STOPPED') botState.lbalance = assignedUSDT_Long;
        if (botState.sstate === 'STOPPED') botState.sbalance = assignedUSDT_Short;

        // Sincronización del símbolo
        botState.config.symbol = newConfig.symbol || "BTC_USDT";
        
        // --- ACTUALIZACIÓN LONG ---
        botState.config.long.amountUsdt = assignedUSDT_Long;
        botState.config.long.purchaseUsdt = parseFloat(newConfig.long?.purchaseUsdt || 0);
        botState.config.long.price_var = parseFloat(newConfig.long?.price_var || 0);
        botState.config.long.size_var = parseFloat(newConfig.long?.size_var || 0);
        botState.config.long.profit_percent = parseFloat(newConfig.long?.trigger || 1.5);

        // --- ACTUALIZACIÓN SHORT ---
        botState.config.short.amountUsdt = assignedUSDT_Short;
        botState.config.short.purchaseUsdt = parseFloat(newConfig.short?.purchaseUsdt || 0);
        botState.config.short.price_var = parseFloat(newConfig.short?.price_var || 0);
        botState.config.short.size_var = parseFloat(newConfig.short?.size_var || 0);
        botState.config.short.profit_percent = parseFloat(newConfig.short?.trigger || 1.5);

        // 6. Recálculo de Cobertura (Solo para visualización en UI)
        const referencePriceL = (botState.lStateData?.ppc || 0) > 0 ? botState.lStateData.ppc : 1;
        const { coveragePrice: covL, numberOfOrders: numL } = calculateLongCoverage(
            botState.lbalance,
            referencePriceL,
            botState.config.long.purchaseUsdt,
            parseNumber(botState.config.long.price_var) / 100,
            parseNumber(botState.config.long.size_var) / 100
        );

        botState.lcoverage = covL;
        botState.lnorder = numL;
        botState.lastUpdateTime = new Date();

        // Marcar cambios para Mongoose y guardado final
        botState.markModified('config.long');
        botState.markModified('config.short');
        botState.markModified('config');
        
        await botState.save();

        console.log("✅ Configuración total guardada exitosamente.");

        return res.json({ 
            success: true, 
            message: "Configuración actualizada correctamente.",
            data: botState 
        });

    } catch (error) {
        console.error("❌ Error en updateBotConfig:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
}

/**
 * Obtener la configuración actual
 */
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