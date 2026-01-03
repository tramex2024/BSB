// BSB/server/src/au/states/short/SRunning.js (ESPEJO de LRunning.js)

// Importamos el modelo de la señal global para poder leer la DB
const MarketSignal = require('../../../../models/MarketSignal');

async function run(dependencies) {
    const { botState, log, updateBotState } = dependencies;
    
    // 💡 1. VERIFICACIÓN DE POSICIÓN (Candado de Seguridad)
    // Si ya tenemos órdenes en el ciclo de Short, transicionamos a SELLING
    // Recuerda: En Short, SELLING es el estado de gestión de órdenes/cobertura.
    if (botState.sStateData && botState.sStateData.orderCountInCycle > 0) {
        log("[S]: Posición Short detectada. Transicionando a SELLING para gestionar cobertura.", 'info');
        await updateBotState('SELLING', 'short'); 
        return; 
    }

    // 💡 2. CONSULTA A LA "PIZARRA" GLOBAL (MongoDB)
    try {
        const globalSignal = await MarketSignal.findOne({ symbol: 'BTC_USDT' });

        if (!globalSignal) {
            log("[S]: Esperando señal de mercado inicial en DB...", 'warning');
            return; 
        }

        // Monitoreo del RSI desde la perspectiva del Short
        log(`[S]: Vigilando... RSI: ${globalSignal.currentRSI.toFixed(2)} | Señal: ${globalSignal.signal}`, 'info');

        // 💡 3. LÓGICA DE ACTIVACIÓN PARA SHORT
        // El analizador emite 'SELL' cuando el RSI está en sobrecompra (ej: > 70)
        if (globalSignal.signal === 'SELL') { 
            log(`¡ALERTA! Señal de VENTA (Short) detectada en DB. Razón: ${globalSignal.reason}`, 'success');
            
            log('[S]: Iniciando ciclo Short. Transicionando a SELLING (Apertura)...', 'info');
            
            // Cambiamos el estado del bot para que SSelling.js tome el control
            // En Short: RUNNING -> SELLING (Apertura) -> BUYING (Cierre/Profit)
            await updateBotState('SELLING', 'short'); 
            return; 
        }

    } catch (error) {
        log(`[S]: ❌ Error al consultar la señal global en DB: ${error.message}`, 'error');
    }
}

module.exports = { run };