// BSB/server/src/utils/cleanState.js

/**
 * Objeto que representa el estado limpio y inicializado de una estrategia (Long o Short).
 * Usado después de una venta exitosa o al detener (STOP) la estrategia.
 */
const CLEAN_STRATEGY_DATA = {
    ppc: 0, // Precio Promedio (Compra o Short)
    ac: 0,  // Cantidad Acumulada
    ppv: 0, // Campo no utilizado, pero limpiado
    av: 0,  // Campo no utilizado, pero limpiado
    orderCountInCycle: 0, // Contador de órdenes en el ciclo
    lastOrder: null, // Información de la última orden (limpiar)
    pm: 0,  // Long: Precio Máximo (Para Trailing Stop)
    pc: 0,  // Precio de Corte (Trailing Stop/Protección)
    lastExecutionPrice: 0, // Precio de la ultima ejecución se reinicia a 0
    requiredCoverageAmount: 0, // Monto de la próxima orden de cobertura
    nextCoveragePrice: 0, // Precio de la próxima orden de cobertura
    cycleStartTime: null // 💡 LIMPIAR EL CAMPO START TIME AL HACER SELL O STOP
};

/**
 * Objeto que contiene todos los campos de nivel raíz que deben reiniciarse
 * al comienzo de un nuevo ciclo o al detener la estrategia.
 * NOTA: lstate/sstate NO se incluyen, ya que se gestionan por separado (RUNNING o STOPPED).
 */
const CLEAN_ROOT_FIELDS = {
    ltprice: 0,    // Target de Gestion de Venta Long
    stprice: 0,    // Target de Gestion de Compra Short
    lsprice: 0,    // Precio de Venta Long
    sbprice: 0,    // Precio de Compra Short
    lcycle: 0,     // Contador de ciclos Long (Reiniciar si es un RESET completo)
    scycle: 0,     // Contador de ciclos Short (Reiniciar si es un RESET completo)
    // lcoverage y lnorder se mantienen con su valor calculado de capacidad
};

module.exports = {
    CLEAN_STRATEGY_DATA,
    CLEAN_ROOT_FIELDS
};