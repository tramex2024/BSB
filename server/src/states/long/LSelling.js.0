// BSB/server/src/states/long/LSelling.js

const autobotCore = require('../../../autobotLogic');
// ELIMINADA la importación directa de 'Autobot' para usar la utilidad centralizada
const { placeSellOrder } = require('../../utils/orderManager');

// Mantenemos el valor fijo según tu backtest
const TRAILING_STOP_PERCENTAGE = 0.4; 

async function run(dependencies) {
    const { botState, currentPrice, config, creds } = dependencies;
    const { ac: acSelling, pm } = botState.lStateData;

    autobotCore.log("Estado Long: SELLING. Gestionando ventas...", 'info');

    // 1. CÁLCULO DEL TRAILING STOP
    const newPm = Math.max(pm || 0, currentPrice);
    const newPc = newPm * (1 - (TRAILING_STOP_PERCENTAGE / 100));

    // 2. ACTUALIZACIÓN Y PERSISTENCIA DE DATOS
    botState.lStateData.pm = newPm;
    botState.lStateData.pc = newPc;

    // CORRECCIÓN: Usamos la función centralizada updateLStateData
    await autobotCore.updateLStateData(botState.lStateData); 

    // 3. CONDICIÓN DE VENTA Y LIQUIDACIÓN
    if (acSelling > 0) {
        if (currentPrice <= newPc) {
            autobotCore.log(`Condiciones de venta por Trailing Stop alcanzadas. Colocando orden de venta a mercado para liquidar ${acSelling.toFixed(8)} BTC.`, 'success');
            
            // Coloca la orden de venta. El reinicio del ciclo (limpieza de lStateData y cambio a RUNNING)
            // será manejado por el callback asíncrono handleSuccessfulSell en dataManager.js.
            await placeSellOrder(config, creds, acSelling);

            // Nota: El estado PERMANECE en SELLING hasta que la orden se confirme como FILLED.
        }
    }
    autobotCore.log(`Esperando condiciones para la venta. Precio actual: ${currentPrice.toFixed(2)}, PM: ${newPm.toFixed(2)}, PC: ${newPc.toFixed(2)}`);
}

module.exports = { run };