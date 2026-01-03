// BSB/server/src/au/states/long/LRunning.js (ETAPA 1: Detector de Señal)

// Importamos el modelo de la señal global para poder leer la DB
const MarketSignal = require('../../../../models/MarketSignal');

async function run(dependencies) {
    const { botState, log, updateBotState } = dependencies;
    
    // 💡 1. VERIFICACIÓN DE POSICIÓN (Candado de Seguridad)
    // Si ya tenemos órdenes en el ciclo, no deberíamos estar en RUNNING, sino en BUYING
    if (botState.lStateData && botState.lStateData.orderCountInCycle > 0) {
        log("[L]: Posición detectada. Transicionando a BUYING para gestionar cobertura.", 'info');
        await updateBotState('BUYING', 'long'); 
        return; 
    }

    // 💡 2. CONSULTA A LA "PIZARRA" GLOBAL (MongoDB)
    try {
        // Buscamos la última señal generada por el servidor
        const globalSignal = await MarketSignal.findOne({ symbol: 'BTC_USDT' });

        if (!globalSignal) {
            log("[L]: Esperando a que el servidor genere la primera señal de mercado...", 'warning');
            return; // Si no hay señal en la DB, no hacemos nada y esperamos al siguiente tick
        }

        // Mostramos en el log lo que estamos leyendo de la DB para monitoreo
        // Esto te ayudará a ver en los logs si el bot está "viendo" el RSI
        log(`[L]: Vigilando... RSI: ${globalSignal.currentRSI.toFixed(2)} | Señal: ${globalSignal.signal}`, 'info');

        // 💡 3. LÓGICA DE ACTIVACIÓN
        if (globalSignal.signal === 'BUY') { 
            log(`¡ALERTA! Señal de COMPRA detectada en DB. Razón: ${globalSignal.reason}`, 'success');
            
            log('[L]: Iniciando ciclo de compra. Transicionando a BUYING...', 'info');
            
            // Cambiamos el estado del bot para que el archivo LBuying.js tome el control
            await updateBotState('BUYING', 'long'); 
            return; 
        }

    } catch (error) {
        log(`[L]: ❌ Error al consultar la señal global en DB: ${error.message}`, 'error');
    }
}

module.exports = { run };