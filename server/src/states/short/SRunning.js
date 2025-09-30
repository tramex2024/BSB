// BSB/server/src/states/short/SRunning.js (INVERTIDO DE LRunning.js)

const analyzer = require('../../bitmart_indicator_analyzer');
const { placeFirstSellOrder } = require('../../utils/orderManager'); // Asumo que existe esta función para Short

async function run(dependencies) {
    // Extraemos las funciones de las dependencias
    const { botState, currentPrice, availableBTC, config, creds, log, updateBotState } = dependencies;

    log("Estado Short: RUNNING. Esperando señal de entrada de VENTA.", 'info');

    const analysisResult = await analyzer.runAnalysis(currentPrice);

    if (analysisResult.action === 'SELL') { // Invertido: Buscamos señal de VENTA
        log(`¡Señal de VENTA detectada! Razón: ${analysisResult.reason}`, 'success');
        
        // Usamos el capital base de BTC para la primera orden
        const sellAmount = parseFloat(config.short.sellBtc); // Usamos sellBtc
        const MIN_USDT_VALUE_FOR_BITMART = 5.00; // La validación del exchange sigue siendo en USDT

        // Validamos con el saldo disponible de BTC y que el valor de la orden cumpla el mínimo de USDT
        if (availableBTC >= sellAmount && (sellAmount * currentPrice) >= MIN_USDT_VALUE_FOR_BITMART) {
            
            // Llama a la función que coloca la primera VENTA (placeFirstSellOrder)
            // Esta función DEBE también actualizar el sStateData (ppv, av, orderCount) e ir a 'SELLING'.
            await placeFirstSellOrder(config, creds, sellAmount, log, updateBotState); 
            
            // Nota: Aquí no restamos el SBalance, ya que la VENTA inicial solo abre la posición.
            // El SBalance se consume en las ÓRDENES DE COBERTURA (SSelling.js), como vimos antes.
            
        } else {
            log(`No hay suficiente BTC para la primera orden o el valor en USDT es muy bajo. Cambiando a NO_COVERAGE.`, 'warning');
            
            // Transicionamos a NO_COVERAGE en la estrategia SHORT
            await updateBotState('NO_COVERAGE', 'short');
        }
    }
}

module.exports = { run };