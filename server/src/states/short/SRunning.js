// BSB/server/src/states/short/SRunning.js (Monitoreo de Targets Short)

const { calculateInitialShortState } = require('../../../autobotShortCalculations');
const { MIN_BTC_SIZE_FOR_BITMART } = require('../../utils/orderManagerShort'); // Usamos la constante Short

const SSTATE = 'short';

async function run(dependencies) {
    // Extraemos las funciones y el estado de las dependencias
    const { botState, currentPrice, availableBTC, config, log, updateBotState, updateSStateData, updateGeneralBotState } = dependencies;

    log("Estado Short: RUNNING. Monitoreando precio para TP o Cobertura.", 'info');

    const sStateData = botState.sStateData;
    const { profit_percent, price_var, size_var, sellBtc } = config.short;
    
    // --- 1. VERIFICACIÓN DE POSICIÓN ACTIVA ---
    // Si la posición se ha cerrado (AC <= 0), reiniciamos el ciclo Short.
    if (sStateData.ac <= 0) {
        log('Posición Short cerrada (AC <= 0). Reiniciando el ciclo Short a BUYING.', 'success');
        
        // Limpiamos y preparamos el estado para la próxima entrada (Venta Inicial)
        const initialState = calculateInitialShortState(config, botState.sbalance);
        
        // Limpiamos el AC, PPC, etc.
        await updateSStateData(initialState);
        
        // Transicionamos a BUYING para que coloque la VENTA inicial.
        await updateBotState('BUYING', SSTATE);
        return;
    }

    // Valores de target
    const targetBuyPrice = botState.stprice || 0; // Target de Cierre (TP)
    const nextCoveragePrice = sStateData.nextCoveragePrice || 0; // Target de Cobertura (DCA UP)

    // --- 2. VERIFICACIÓN DE TRANSICIÓN A CIERRE (TP alcanzado) ---
    // En Short, el TP se alcanza cuando el precio CAE.
    if (currentPrice <= targetBuyPrice && targetBuyPrice > 0) {
        log(`Precio actual alcanzó el objetivo de Cierre/TP Short (${targetBuyPrice.toFixed(2)}). Transicionando a SELLING.`, 'success');
        await updateBotState('SELLING', SSTATE);
        return;
    }

    // --- 3. VERIFICACIÓN DE TRANSICIÓN A COBERTURA (DCA UP) ---
    // La cobertura Short se activa cuando el precio SUBE.
    if (currentPrice >= nextCoveragePrice && nextCoveragePrice > 0) {
        log(`Precio actual alcanzó el objetivo de Cobertura Short (${nextCoveragePrice.toFixed(2)}). Transicionando a BUYING.`, 'warning');
        
        const requiredAmount = sStateData.requiredCoverageAmount || 0;
        
        // Verificar si hay fondos BTC reales y asignados antes de pasar a BUYING
        if (botState.sbalance >= requiredAmount && availableBTC >= requiredAmount && requiredAmount >= MIN_BTC_SIZE_FOR_BITMART) {
            await updateBotState('BUYING', SSTATE);
        } else {
            log(`Precio de cobertura alcanzado, pero el balance BTC es insuficiente (Requiere: ${requiredAmount.toFixed(8)} BTC). Transicionando a NO_COVERAGE.`, 'error');
            // Almacenar el monto requerido en caso de que no esté actualizado
            await updateSStateData({ requiredCoverageAmount: requiredAmount });
            await updateBotState('NO_COVERAGE', SSTATE);
        }
        return;
    }

    // Si no hay transiciones, loguear el estado actual.
    log(`Targets: TP Cierre: ${targetBuyPrice.toFixed(2)}, Cobertura: ${nextCoveragePrice.toFixed(2)}. Precio actual: ${currentPrice.toFixed(2)}.`, 'debug');
}

module.exports = { run };