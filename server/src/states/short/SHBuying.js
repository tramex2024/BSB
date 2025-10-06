// BSB/server/src/states/short/SHBuying.js

const { checkAndPlaceCoverageOrder } = require('../../utils/coverageLogic');
const SSTATE = 'short';

async function run(dependencies) {
    const { botState, currentPrice, config, log, updateBotState, updateGeneralBotState } = dependencies;

    log("Estado Short: SHBUYING. Monitoreando precio para Cobertura (UP) o Venta (DOWN).", 'info');

    const { ppc: pps, ac: acShort, pm } = botState.sStateData; // PPC se convierte en PPS (Precio Promedio de Short)
    const { profit_percent } = config.short;

    // 1. CÁLCULO DEL PRECIO OBJETIVO DE COBERTURA (SHCoverage)
    // Cobertura Short se activa cuando el precio SUBE
    // La lógica exacta la maneja coverageLogic, aquí solo llamamos.

    // 2. CÁLCULO DEL PRECIO OBJETIVO DE GANANCIA (SHTarget)
    // Ganancia Short se activa cuando el precio CAE por debajo del PPS
    const shTargetPrice = pps * (1 - (profit_percent / 100));
    
    // 3. VERIFICACIÓN DE VENTA/CUBRIMIENTO (Salida de Ganancia)
    if (currentPrice <= shTargetPrice && acShort > 0 && pps > 0) {
        log(`Precio de ganancia Short alcanzado (${shTargetPrice.toFixed(2)}). Transicionando a SHSELLING.`, 'success');
        
        // 💡 CRÍTICO: Transicionar a SHSELLING para que el otro estado coloque la orden
        await updateBotState('SHSELLING', SSTATE);
        return;
    }
    
    // 4. VERIFICACIÓN DE COBERTURA (DCA UP)
    // El checkAndPlaceCoverageOrder (Short) se activará si el precio SUBE.
    // Llama a la lógica de cobertura (SHORT) si se cumplen las condiciones de precio.
    await checkAndPlaceCoverageOrder(botState, dependencies.availableUSDT, currentPrice, dependencies.creds, config, log, updateBotState, dependencies.updateSStateData, updateGeneralBotState);
    
    log(`PPS: ${pps.toFixed(2)}, Objetivo Venta (Ganancia): ${shTargetPrice.toFixed(2)}.`, 'info');
}

module.exports = { run };