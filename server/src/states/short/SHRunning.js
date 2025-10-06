// BSB/server/src/states/short/SHRunning.js

const { placeFirstSellOrder, MIN_USDT_VALUE_FOR_BITMART } = require('../../utils/orderManagerShort');
const SSTATE = 'short';

async function run(dependencies) {
    // 💡 CRÍTICO: Aseguramos que currentPrice se recibe para el cálculo nocional
    const { botState, availableUSDT, config, log, updateBotState, updateGeneralBotState, currentPrice } = dependencies;

    log("Estado Short: RUNNING. Evaluando inicio de ciclo...", 'info');
    
    // ------------------------------------------------------------------
    // 0. CONTROL DE FLUJO: Evitar doble entrada
    // ------------------------------------------------------------------
    // Si ya hay órdenes en el ciclo, SHRunning no debe iniciar uno nuevo, sino transicionar al estado de gestión.
    if (botState.sStateData.orderCountInCycle > 0) {
        log("Ya hay una posición Short abierta. Transicionando a BUYING para gestionar la cobertura.", 'info');
        await updateBotState('BUYING', SSTATE); // Transiciona al estado de gestión de posición
        return;
    }

    // ------------------------------------------------------------------
    // 1. CÁLCULO DE VALORES NOCIONALES (USDT)
    // ------------------------------------------------------------------
    const sellBtcAmount = parseFloat(config.short.sellBtc || 0);
    const price = parseFloat(currentPrice || 0); 

    // ✅ CAPITAL ASIGNADO (SBalance en BTC) CONVERTIDO A VALOR NOCIONAL EN USDT
    const currentSBalanceBTC = parseFloat(botState.sbalance || 0); 
    const currentSBalanceUSDT = currentSBalanceBTC * price; 

    // ✅ ORDEN INICIAL (sellBtc en BTC) CONVERTIDA A VALOR NOCIONAL EN USDT
    const purchaseAmountUSDT = sellBtcAmount * price; 
    
    // ------------------------------------------------------------------
    // 2. CHEQUEO DE PRECIO Y VALIDEZ
    // ------------------------------------------------------------------
    if (price === 0 || isNaN(purchaseAmountUSDT)) {
        log(`No se pudo obtener un precio de mercado válido (${price}) para calcular el valor de la orden.`, 'warning');
        return;
    }

    // ------------------------------------------------------------------
    // 3. CHEQUEO DE SUFICIENCIA (Todos los chequeos son ahora en USDT)
    // ------------------------------------------------------------------
    const isSufficient = currentSBalanceUSDT >= purchaseAmountUSDT && 
                         availableUSDT >= purchaseAmountUSDT && 
                         purchaseAmountUSDT >= MIN_USDT_VALUE_FOR_BITMART;

    if (isSufficient) {
        log(`Condiciones de inicio cumplidas. Capital asignado (USDT Nocional): ${currentSBalanceUSDT.toFixed(2)}.`, 'success');
        
        // NOTA: La lógica de la señal de trading (RSI, EMA, etc.) debería ir aquí. 
        // Si la señal no es válida, debe retornar.

        // 💡 Transición al estado de gestión de posición: 'BUYING'
        await updateBotState('BUYING', SSTATE);
        
        // Colocar la primera orden de VENTA en corto
        await placeFirstSellOrder(config, dependencies.creds, log, updateBotState, updateGeneralBotState, currentPrice);

    } else {
        // Detalle de la razón por la cual no se puede iniciar el ciclo
        let reason = '';
        if (currentSBalanceUSDT < purchaseAmountUSDT) {
            reason = `Fondo ASIGNADO (USDT Nocional: ${currentSBalanceUSDT.toFixed(2)}) insuficiente para orden de ${purchaseAmountUSDT.toFixed(2)} USDT.`;
        } else if (availableUSDT < purchaseAmountUSDT) {
            reason = `Fondos REALES (${availableUSDT.toFixed(2)} USDT) insuficientes.`;
        } else {
            reason = `Monto inicial (${purchaseAmountUSDT.toFixed(2)} USDT) menor que el mínimo de BitMart (${MIN_USDT_VALUE_FOR_BITMART}).`;
        }
        
        log(`No se puede iniciar el ciclo Short. Razón: ${reason} Permaneciendo en RUNNING.`, 'warning');
    }
}

module.exports = { run };