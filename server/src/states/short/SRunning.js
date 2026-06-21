// BSB/server/src/states/short/SRunning.js

/**
 * S-RUNNING STATE (SHORT):
 * Monitorea señales de mercado para abrir una posición en corto.
 * Corregido: Sincronización de proyección visual en tiempo real (2026).
 */

const MarketSignal = require('../../../models/MarketSignal');
const { calculateShortCoverage } = require('../../../autobotCalculations');

async function run(dependencies) {
    // 1. Contexto inyectado
    const { 
        userId, 
        botState, 
        log, 
        updateBotState, 
        currentPrice, 
        updateGeneralBotState,
        config,
        marketContext // 🟢 AUDITORÍA: Recibimos el contexto optimizado e inyectado desde el motor maestro
    } = dependencies;
    
    // 0. Bloqueo de seguridad: Precio inválido
    if (!currentPrice || currentPrice <= 0) return; 

    // 1. VERIFICACIÓN DE POSICIÓN HUÉRFANA
    // 🟢 AUDITORÍA: Si el usuario ya tiene activos vendidos (sac > 0), el bot debe gestionar la posición.
    // Esto previene que el bot ignore una deuda abierta si el estado se desincronizó.
    const currentAC = parseFloat(botState.sac || 0); 
    
    if (currentAC > 0) {
//         log("[S-RUNNING] 🛡️ Posición Short activa detectada (sac > 0). Corrigiendo estado a SELLING...", 'warning');
        await updateBotState('SELLING', 'short'); 
        return; 
    }

    // --- NUEVO: ACTUALIZACIÓN DE PROYECCIÓN VISUAL SHORT ---
    // Proyectamos el techo de protección (scoverage) basado en el precio actual
    // mientras esperamos la señal de entrada.
    // 🟢 AUDITORÍA: El cálculo es 100% atómico por usuario al usar su sbalance y config.
    const coverageInfo = calculateShortCoverage(
        parseFloat(botState.sbalance || 0),
        currentPrice, // Base real de mercado para el Short
        config.short.purchaseUsdt,
        (config.short.price_var / 100),
        parseFloat(config.short.size_var || 0),
        0, // Orden inicial
        (config.short.price_step_inc / 100)
    );

    await updateGeneralBotState({ 
        scoverage: coverageInfo.coveragePrice,
        snorder: coverageInfo.numberOfOrders
    });

    try {
        // 2. CONSULTA DE SEÑALES GLOBALES
        const SYMBOL = botState.config?.symbol || 'BTC_USDT';
        
        // 🟢 AUDITORÍA: Usamos prioritariamente la inyección atómica del motor para evitar sobrecarga I/O de la DB.
        // Si no existe, recurrimos al fallback de lectura directa.
        let globalSignal = marketContext;

        if (!globalSignal || !globalSignal.signal) {
            globalSignal = await MarketSignal.findOne({ symbol: SYMBOL });
        }

        if (!globalSignal) return;

        // 🟢 AUDITORÍA: Control preventivo ante posibles valores nulos o indefinidos en variantes de campos espejo (rsi14 vs currentRSI)
        const rsiValue = globalSignal.currentRSI !== undefined ? globalSignal.currentRSI : (globalSignal.rsi14 !== undefined ? globalSignal.rsi14 : 50);

        // Log de monitoreo (Heartbeat)
        log(`[S-RUNNING] 👁️ RSI: ${rsiValue.toFixed(2)} | Signal: ${globalSignal.signal} | BTC: ${currentPrice.toFixed(2)}`, 'debug');

        // 3. VALIDACIÓN DE OBSOLESCENCIA
        // 🟢 AUDITORÍA: Vital para evitar entradas en falso si el servicio de señales (MarketSignal) se congela.
        const signalTime = globalSignal.lastUpdate || globalSignal.updatedAt;

        if (!signalTime) {
            return;
        }

        const signalAgeMinutes = (Date.now() - new Date(signalTime).getTime()) / 60000;
        if (signalAgeMinutes > 5) {
//             log(`[S-RUNNING] ⚠️ Señal Short obsoleta (${signalAgeMinutes.toFixed(1)} min). Ignorando.`, 'warning');
            return;
        }

        // 4. LÓGICA DE ACTIVACIÓN (Entrada al Mercado)
        if (globalSignal.signal === 'SELL') { 
            log(`🚀 [S-SIGNAL] ¡OPORTUNIDAD DE SHORT DETECTADA! RSI: ${rsiValue.toFixed(2)}.`, 'success');
            
            // Pasamos a SELLING para ejecutar la primera venta de apertura (Creación de la deuda)
            await updateBotState('SELLING', 'short'); 
            return; 
        }

    } catch (error) {
        log(`[S-RUNNING] ❌ Error en señales: ${error.message}`, 'error');
    }
}

module.exports = { run };