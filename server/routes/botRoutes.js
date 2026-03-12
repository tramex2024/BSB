// BSB/server/src/routes/botRoutes.js

router.get('/stop-preview/:strategyType', async (req, res) => {
    try {
        const { strategyType } = req.params;
        const userId = req.user.id;
        const botState = await getBotState(userId);
        const ticker = await bitmartService.getTicker(botState.config.symbol);
        const currentPrice = parseFloat(ticker.last);

        // Llamamos al servicio que unifica las 3 estrategias
        const report = await ExitLiquidationService.getExitReport(strategyType, botState, currentPrice);

        // Mapeamos el reporte al JSON estructurado para el Frontend
        const response = {
            strategy: strategyType,
            canLiquidate: report.hasPendingAssets,
            currentPrice: currentPrice,
            liquidationAsset: 'BTC',
            liquidationAmount: report.amount,
            financials: {
                initialAveragePrice: report.initialValueUsdt / report.amount,
                initialValueUsdt: report.initialValueUsdt,
                currentValueUsdt: report.currentValueUsdt,
                pnlUsdt: report.pnlUsdt,
                pnlPercentage: report.pnlPercentage
            }
        };

        res.json({ status: 'success', data: response });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});