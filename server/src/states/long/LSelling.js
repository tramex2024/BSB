// BSB/server/src/states/long/LSelling.js (ACTUALIZADO)

const { placeSellOrder } = require('../../utils/orderManager');

const TRAILING_STOP_PERCENTAGE = 0.4; 

async function run(dependencies) {
    // Extraemos las funciones de las dependencias
    const { botState, currentPrice, config, creds, log, updateLStateData } = dependencies;
    const { ac: acSelling, pm } = botState.lStateData;

    log("Estado Long: SELLING. Gestionando ventas...", 'info');

    // 1. CÁLCULO DEL TRAILING STOP
    const newPm = Math.max(pm || 0, currentPrice);
    const newPc = newPm * (1 - (TRAILING_STOP_PERCENTAGE / 100));

    // 2. ACTUALIZACIÓN Y PERSISTENCIA DE DATOS
    botState.lStateData.pm = newPm;
    botState.lStateData.pc = newPc;

    await updateLStateData(botState.lStateData); // Usamos la función inyectada

    // 3. CONDICIÓN DE VENTA Y LIQUIDACIÓN
    if (acSelling > 0) {
        if (currentPrice <= newPc) {
            log(`Condiciones de venta por Trailing Stop alcanzadas. Colocando orden de venta a mercado para liquidar ${acSelling.toFixed(8)} BTC.`, 'success');
            
            // Llama a la función y pasa log
            await placeSellOrder(config, creds, acSelling, log);

            // Nota: El estado PERMANECE en SELLING hasta que la orden se confirme como FILLED.
        }
    }
    // En BSB/server/src/states/long/LSelling.js (línea final de log)
autobotCore.log(`Esperando condiciones para la venta. Precio actual: ${currentPrice.toFixed(2)}, PM: ${newPm.toFixed(2)}, PC: ${newPc.toFixed(2)}`);
}

module.exports = { run };