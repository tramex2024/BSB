// BSB/server/src/au/utils/coverageLogicShort.js (CORREGIDO - Bloqueo de Órdenes Duplicadas y manejo de fallos)

const { placeCoverageSellOrder, MIN_USDT_VALUE_FOR_BITMART } = require('../managers/shortOrderManager');
const Autobot = require('../../../models/Autobot'); 
const AutobotCore = require('../../../autobotLogic'); // Para updateGeneralBotState

/**
 * Verifica las condiciones de cobertura (DCA UP) y, si es necesario y hay fondos, coloca la orden.
 * La cobertura Short se dispara cuando el precio SUBE.
 * * @param {object} botState - Objeto de estado del bot (de la DB).
 * @param {number} availableUSDT - USDT disponible en la cuenta.
 * @param {number} currentPrice - Precio actual del mercado.
 * @param {object} creds - Credenciales de la API.
 * @param {object} config - Configuración del bot.
 * @param {function} log - Función de logging inyectada.
 * @param {function} updateBotState - Función para cambiar el estado inyectada.
 * @param {function} updateSStateData - Función para actualizar sStateData inyectada.
 * @param {function} updateGeneralBotState - Función para actualizar SBalance inyectada. 
 */
async function checkAndPlaceCoverageOrder(botState, availableUSDT, currentPrice, creds, config, log, updateBotState, updateSStateData, updateGeneralBotState) {
    
    // Usamos sStateData (Short State Data)
    const { ppc: pps, ac: acShort, lastOrder, requiredCoverageAmount } = botState.sStateData;
    const { price_var, size_var, sellBtc } = config.short; 
    const currentSBalance = parseFloat(botState.sbalance || 0);

    // 💡 CORRECCIÓN CRÍTICA #3: BLOQUEO DE ORDEN DUPLICADA
    // Si ya existe una orden de VENTA pendiente (Short Sell/Cobertura), no intentar colocar otra.
    if (lastOrder && lastOrder.side === 'sell' && lastOrder.state === 'pending_fill') {
        log(`Ya existe una orden de COBERTURA (SELL) pendiente (ID: ${lastOrder.order_id}). Esperando confirmación.`, 'info');
        return; // Detener la ejecución en este ciclo.
    }
    // FIN CORRECCIÓN CRÍTICA #3
    
    // 💡 CRÍTICO: Si existe un requiredCoverageAmount pero NO hay lastOrder (lo que indica que la orden FALLÓ en orderManagerShort.js), 
    // debemos REVERTIR el SBalance antes de intentar una nueva orden, o quedará asignado.
    if (requiredCoverageAmount > 0 && (!lastOrder || lastOrder.state !== 'pending_fill')) {
        log(`Advertencia: Se detectó capital asignado (${requiredCoverageAmount.toFixed(2)} USDT) sin orden activa. Reasignando capital a SBalance.`, 'warning');
        
        const newSBalance = currentSBalance + requiredCoverageAmount;
        await updateGeneralBotState({ sbalance: newSBalance });
        
        // Limpiar el monto requerido
        botState.sStateData.requiredCoverageAmount = 0;
        await updateSStateData(botState.sStateData);
        await updateBotState('RUNNING', 'short');
        return; // Detener para que el ciclo se reinicie limpiamente.
    }


    if (pps <= 0 || !lastOrder || !lastOrder.price) {
        log("Lógica de cobertura Short: Posición no inicializada o incompleta.", 'warning');
        return;
    }

    const lastOrderPrice = parseFloat(lastOrder.price); 
    // Usamos el monto de la última orden de cobertura (la última que se llenó)
    const lastOrderUsdtNotional = parseFloat(lastOrder.usdt_amount || (sellBtc * lastOrder.price)); 

    // 1. CÁLCULO DEL PRÓXIMO PRECIO DE COBERTURA (Disparo UP)
    const nextCoveragePrice = lastOrderPrice * (1 + (price_var / 100));

    // 2. CÁLCULO DEL MONTO REQUERIDO ESCALADO (en USDT)
    const nextUSDTNotional = lastOrderUsdtNotional * (1 + (size_var / 100));
    
    // 3. Condición de Disparo (Precio actual SUBE al objetivo)
    if (currentPrice >= nextCoveragePrice) { 
        
        // 4. CALCULAR EL MONTO DE LA ORDEN EN BTC (Cantidad requerida)
        const nextSellAmountBTC = nextUSDTNotional / currentPrice;

        log(`Disparo de cobertura Short activado. Objetivo (UP): ${nextCoveragePrice.toFixed(2)}. Monto Estimado: ${nextUSDTNotional.toFixed(2)} USDT (${nextSellAmountBTC.toFixed(8)} BTC).`, 'info');

        // 5. Verificación de Fondos (SBalance y Saldo Real)
        const isSufficient = currentSBalance >= nextUSDTNotional && // Verificamos USDT contra SBalance
                             availableUSDT >= nextUSDTNotional && 
                             nextUSDTNotional >= MIN_USDT_VALUE_FOR_BITMART;

        if (isSufficient) {
            
            // 6. RESTA DE CAPITAL ASIGNADO (SBalance) ANTES de colocar la orden
            const newSBalance = currentSBalance - nextUSDTNotional;
            await updateGeneralBotState({ sbalance: newSBalance });
            log(`SBalance asignado reducido en ${nextUSDTNotIONAL.toFixed(2)} USDT para cobertura.`, 'info');
            
            // 7. Persistir los datos de la orden *antes* de colocarla (para reversión si falla)
            botState.sStateData.requiredCoverageAmount = nextUSDTNotional; // Monto requerido en USDT
            botState.sStateData.nextCoveragePrice = nextCoveragePrice; 
            await updateSStateData(botState.sStateData); 

            // 8. Colocar la orden de cobertura (VENTA en corto)
            // placeCoverageSellOrder gestionará el lastOrder y la transición
            await placeCoverageSellOrder(botState, creds, nextSellAmountBTC, nextCoveragePrice, log, updateBotState); 

        } else {
            // FONDOS INSUFICIENTES: Transición a SH_NO_COVERAGE
            let reason = currentSBalance < nextUSDTNotional ? 
                         `LÍMITE DE CAPITAL ASIGNADO (SBalance: ${currentSBalance.toFixed(2)} USDT) insuficiente.` : 
                         `Fondos REALES (${availableUSDT.toFixed(2)} USDT) insuficientes.`;
            
            // Persistir los datos de la orden fallida para el Front-End
            botState.sStateData.requiredCoverageAmount = nextUSDTNotional; // Monto requerido en USDT
            botState.sStateData.nextCoveragePrice = nextCoveragePrice; 
            await updateSStateData(botState.sStateData); 

            // Transicionar a SH_NO_COVERAGE.
            log(`No se puede colocar la orden. ${reason} Cambiando a SH_NO_COVERAGE.`, 'warning');
            await updateBotState('SH_NO_COVERAGE', 'short');
        }
    }
}

module.exports = {
    checkAndPlaceCoverageOrder
};