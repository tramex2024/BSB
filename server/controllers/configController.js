// server/controllers/configController.js
const Autobot = require('../models/Autobot'); 
const bitmartService = require('../services/bitmartService'); 
const { calculateLongCoverage, parseNumber } = require('../autobotCalculations'); 

/**
 * Maneja la actualización de la configuración del bot, validación de balances
 * y persistencia de los estados StopAtCycle.
 */
async function updateBotConfig(req, res) {
    try {
        // Extraemos 'config' porque el frontend lo envía como { config: { ... } }
        const { config: newConfig } = req.body; 
        
        if (!newConfig) {
            return res.status(400).json({ success: false, message: "No configuration data provided." });
        }

        let botState = await Autobot.findOne({});
        const isNewBot = !botState;

        // 1. Obtener saldos reales de BitMart para validación
        const { availableUSDT, availableBTC } = await bitmartService.getAvailableTradingBalances();

        const assignedUSDT = parseFloat(newConfig.long?.amountUsdt || 0);
        const assignedBTC = parseFloat(newConfig.short?.amountBtc || 0);

        // 2. Validación de fondos
        if (assignedUSDT > availableUSDT) {
            return res.status(400).json({ 
                success: false, 
                message: `USDT Assignment (${assignedUSDT}) exceeds real balance (${availableUSDT.toFixed(2)})` 
            });
        }
        if (assignedBTC > availableBTC) {
            return res.status(400).json({ 
                success: false, 
                message: `BTC Assignment (${assignedBTC}) exceeds real balance (${availableBTC.toFixed(8)})` 
            });
        }

        // 3. Aplicar cambios al estado del Bot
        if (isNewBot) {
            botState = new Autobot({
                config: newConfig,
                lbalance: assignedUSDT,
                sbalance: assignedBTC
            });
        } else {
            // Actualizar balances solo si la pierna correspondiente está detenida
            if (botState.lstate === 'STOPPED') botState.lbalance = assignedUSDT;
            if (botState.sstate === 'STOPPED') botState.sbalance = assignedBTC;

            // Actualización profunda de objetos anidados (Crítico para stopAtCycle)
            botState.config.symbol = newConfig.symbol || "BTC_USDT";
            
            // Long config
            botState.config.long.amountUsdt = assignedUSDT;
            botState.config.long.purchaseUsdt = parseFloat(newConfig.long?.purchaseUsdt || 0);
            botState.config.long.price_var = parseFloat(newConfig.long?.price_var || 0);
            botState.config.long.size_var = parseFloat(newConfig.long?.size_var || 0);
            botState.config.long.stopAtCycle = !!newConfig.long?.stopAtCycle; // Forzar booleano

            // Short config
            botState.config.short.amountBtc = assignedBTC;
            botState.config.short.sellBtc = parseFloat(newConfig.short?.sellBtc || 0);
            botState.config.short.price_var = parseFloat(newConfig.short?.price_var || 0);
            botState.config.short.size_var = parseFloat(newConfig.short?.size_var || 0);
            botState.config.short.stopAtCycle = !!newConfig.short?.stopAtCycle; // Forzar booleano

            // Avisar a Mongoose que el objeto 'config' cambió
            botState.markModified('config');
        }

        // 4. Recálculo de Cobertura (Trigger) si cambió el purchaseUsdt
        // (Se asume que la función calculateLongCoverage está importada correctamente)
        const referencePrice = (botState.lStateData?.ppc || 0) > 0 ? botState.lStateData.ppc : 1;
        const priceVarDec = (botState.config.long.price_var) / 100;
        const sizeVarDec = (botState.config.long.size_var) / 100;

        const { coveragePrice, numberOfOrders } = calculateLongCoverage(
            botState.lbalance,
            referencePrice,
            botState.config.long.purchaseUsdt,
            priceVarDec,
            sizeVarDec
        );

        botState.lcoverage = coveragePrice;
        botState.lnorder = numberOfOrders;

        // 5. Guardar en Base de Datos
        await botState.save();

        return res.json({ 
            success: true, 
            message: "Configuration and targets updated successfully.",
            data: botState 
        });

    } catch (error) {
        console.error("Error in updateBotConfig:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
}

async function getBotConfig(req, res) {
    try {
        const botState = await Autobot.findOne({});
        if (!botState) return res.status(404).json({ success: false, message: "Not found" });
        res.json({ success: true, config: botState.config });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}

module.exports = { updateBotConfig, getBotConfig };