// BSB/server/src/states/long/LNoCoverage.js

const autobotCore = require('../../../autobotLogic');

async function run(dependencies) {
    const { botState, currentPrice, availableUSDT, config } = dependencies;

    autobotCore.log("Estado Long: NO_COVERAGE. Esperando fondos o precio de venta.", 'warning');

    const { ppc: ppcNoCov, ac: acNoCov } = botState.lStateData;
    const triggerPercentageNoCov = config.long.trigger;

    if (ppcNoCov > 0 && triggerPercentageNoCov > 0) {
        const targetSellPrice = ppcNoCov * (1 + (triggerPercentageNoCov / 100));

        if (currentPrice >= targetSellPrice && (acNoCov || 0) > 0) {
            autobotCore.log(`Precio actual (${currentPrice.toFixed(2)}) alcanzó el objetivo de venta por TRIGGER (${targetSellPrice.toFixed(2)}) desde NO_COVERAGE. Transicionando a SELLING.`, 'success');
            await autobotCore.updateBotState('SELLING', botState.sstate);
        }
    }

    if (availableUSDT >= parseFloat(config.long.purchaseUsdt)) {
        autobotCore.log("Fondos recuperados. Volviendo a estado BUYING para intentar la cobertura.", 'success');
        await autobotCore.updateBotState('BUYING', botState.sstate);
    }
}

module.exports = { run };