// BSB/server/src/controllers/botController.js

async function handleStopAction(req, res) {
    const { userId, strategyType, action } = req.body; // action: 'liquidate' | 'keep'
    
    try {
        const botState = await BotModel.findOne({ userId });
        const ticker = await bitmartService.getTicker(botState.config.symbol);
        const report = await ExitLiquidationService.getExitReport(strategyType, botState, ticker.last);

        // A. EJECUTAR LIQUIDACIÓN SI EL USUARIO LO PIDIÓ
        if (action === 'liquidate' && report.hasPendingAssets) {
            await bitmartService.marketSell(
                report.assetToLiquidate, 
                report.amount, 
                userCreds
            );
        }

        // B. LIMPIAR ESTADO Y CERRAR
        // Pasamos el report para que el total_profit se actualice con el PnL final
        await resetBotState(userId, strategyType, action === 'liquidate' ? report : null);

        return res.json({ 
            success: true, 
            message: action === 'liquidate' ? 'Assets liquidated and bot stopped.' : 'Bot stopped, assets kept in wallet.' 
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

// BSB/server/src/controllers/botController.js (Fragmento Final de Stop)

async function stopBotController(req, res) {
    const { userId, strategyType, action } = req.body; 
    const botState = await getBotState(userId);
    const userCreds = await getUserCreds(userId);

    try {
        // PASO 1: Cancelar órdenes pendientes (Seguridad)
        await OrderCleanupService.cleanupPendingOrders(strategyType, botState, userCreds, log);

        // PASO 2: Generar Reporte Final (Preview de PnL)
        const ticker = await bitmartService.getTicker(botState.config.symbol);
        const report = await ExitLiquidationService.getExitReport(strategyType, botState, ticker.last);

        // PASO 3: Ejecutar Liquidación a Mercado (Si el usuario eligió "Sell & Stop")
        if (action === 'liquidate' && report.hasPendingAssets) {
            await bitmartService.marketSell(report.assetToLiquidate, report.amount, userCreds);
        }

        // PASO 4: Reset de la DB (Uso de CLEAN_ROOT + Liberación de balances)
        await resetBotState(userId, strategyType, action === 'liquidate' ? report : null);

        return res.json({ success: true, message: `Strategy ${strategyType} stopped correctly.` });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}