// BSB/server/src/states/short/SNoCoverage.js (Espera Fondos BTC o Precio de Cierre)

// Importamos la constante del mínimo de BTC para operar en BitMart.
const { MIN_BTC_SIZE_FOR_BITMART } = require('../../utils/orderManagerShort'); 
// No se necesita importar cancelActiveOrders ya que no hay orden pendiente que cancelar.

async function run(dependencies) {
    // Extraemos las funciones y el estado de las dependencias
    // Nota: Usamos availableBTC ya que el Short necesita BTC para la cobertura.
    const { botState, currentPrice, availableBTC, config, creds, log, updateBotState } = dependencies;

    log("Estado Short: NO_COVERAGE. Esperando fondos BTC o precio de cierre (TP).", 'warning');

    const { ac } = botState.sStateData; // AC es la cantidad total de BTC vendida (posición abierta)
    
    // --- 1. VERIFICACIÓN DE TRANSICIÓN A CIERRE (Ganancia alcanzada) ---
    // En Short, el TP es el target de COMPRA (STPrice) y se alcanza cuando el precio CAE.
    const targetBuyPrice = botState.sStateData.STPrice || 0; 

    if (currentPrice <= targetBuyPrice && ac > 0 && targetBuyPrice > 0) {
        log(`[SHORT] Precio actual alcanzó el objetivo de cierre (${targetBuyPrice.toFixed(2)}) desde NO_COVERAGE.`, 'success');
        
        // Transición al estado de Cierre (SSelling).
        await updateBotState('SELLING', 'short'); 
        return;
    }

    // --- 2. VERIFICACIÓN DE TRANSICIÓN A COBERTURA (Fondos BTC recuperados) ---
    
    // Monto de BTC requerido para la próxima orden de DCA (Venta).
    const requiredAmount = botState.sStateData.requiredCoverageAmount || 0; 
    // Balance de BTC asignado al Short.
    const currentSBalance = parseFloat(botState.sbalance || 0);
    
    // ✅ CRÍTICO: Debe tener SBalance y Saldo Real de BTC para poder VENDER (DCA UP).
    const isReadyToResume = 
        currentSBalance >= requiredAmount && 
        availableBTC >= requiredAmount && 
        requiredAmount >= MIN_BTC_SIZE_FOR_BITMART;

    if (isReadyToResume) {
        log(`[SHORT] Fondos (SBalance y Real BTC) recuperados/disponibles. Monto requerido (${requiredAmount.toFixed(8)} BTC). Volviendo a BUYING.`, 'success');
        
        // Transición al estado de gestión de DCA (SBuying) para colocar la orden de VENTA DCA.
        await updateBotState('BUYING', 'short'); 
    } else {
         let reason = '';
         if (currentSBalance < requiredAmount) {
             reason = `[SHORT] Esperando reposición de SBalance asignado (BTC). (Requiere: ${requiredAmount.toFixed(8)}, Actual: ${currentSBalance.toFixed(8)})`;
         } else {
             reason = `[SHORT] Esperando reposición de Fondos Reales (BTC) en el Exchange. (Requiere: ${requiredAmount.toFixed(8)}, Actual: ${availableBTC.toFixed(8)})`;
         }
         log(reason, 'info'); // Logear para mostrar qué está esperando
    }
}

module.exports = { run };