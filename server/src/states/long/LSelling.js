// BSB/server/src/states/long/LSelling.js

const autobotCore = require('../../../autobotLogic');
const Autobot = require('../../../models/Autobot');
const { placeSellOrder } = require('../../longUtils');
const TRAILING_STOP_PERCENTAGE = 0.4;

async function run(dependencies) {
    const { botState, currentPrice, config, creds } = dependencies;
    const { ac: acSelling, pm } = botState.lStateData;

    autobotCore.log("Estado Long: SELLING. Gestionando ventas...", 'info');

    const newPm = Math.max(pm || 0, currentPrice);
    const newPc = newPm * (1 - (TRAILING_STOP_PERCENTAGE / 100));

    botState.lStateData.pm = newPm;
    botState.lStateData.pc = newPc;

    // Actualizar el estado del bot en la base de datos
    await Autobot.findOneAndUpdate({}, { 'lStateData': botState.lStateData });

    if (acSelling > 0) {
        if (currentPrice <= newPc) {
            autobotCore.log(`Condiciones de venta por Trailing Stop alcanzadas. Colocando orden de venta.`, 'success');
            await placeSellOrder(config, creds, acSelling);
        }
    }
    autobotCore.log(`Esperando condiciones para la venta. Precio actual: ${currentPrice.toFixed(2)}, PM: ${newPm.toFixed(2)}, PC: ${newPc.toFixed(2)}`);
}

module.exports = { run };