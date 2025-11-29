// BSB/server/src/utils/cleanState.js (VERSIÓN FINAL CORREGIDA)

/**
 * Objeto que representa el estado limpio y inicializado de una estrategia (Long o Short).
 * Usado después de una venta exitosa o al detener (STOP) la estrategia.
 */
const CLEAN_STRATEGY_DATA = {
    ppc: 0, // Precio Promedio (Compra o Short)
    ac: 0,  // Cantidad Acumulada
    ai: 0,  // 🛑 CRÍTICO: Inversión Acumulada (Necesario para un reset completo)
    ppv: 0, // Campo no utilizado
    av: 0,  // Campo no utilizado
    orderCountInCycle: 0, // Contador de órdenes en el ciclo
    lastOrder: null, // Información de la última orden (limpiar)
    pm: 0,  // Long: Precio Máximo (Para Trailing Stop)
    pc: 0,  // Precio de Corte (Trailing Stop/Protección)
    lastExecutionPrice: 0, // Precio de la ultima ejecución
    requiredCoverageAmount: 0, // Monto de la próxima orden de cobertura
    nextCoveragePrice: 0, // Precio de la próxima orden de cobertura
    cycleStartTime: null // LIMPIAR EL START TIME
};

/**
 * Objeto que contiene todos los campos de nivel raíz que deben reiniciarse
 * al comienzo de un nuevo ciclo o al detener la estrategia.
 * 🛑 NOTA: lcoverage y lnorder NO se reinician, ya que representan la capacidad.
 */
const CLEAN_ROOT_FIELDS = {
    ltprice: 0,     // Target de Gestion de Venta Long
    stprice: 0,     // Target de Gestion de Compra Short
    lsprice: 0,     // Precio de Venta Long (Trailing Stop)
    sbprice: 0,     // Precio de Compra Short (Trailing Stop)
    //lcycle: 0,      // Contador de ciclos Long ()
    //scycle: 0,      // Contador de ciclos Short ()
    // lcoverage, scoverage, lnorder, snorder, lcycle, y scycle se dejan intactos.
};

module.exports = {
    CLEAN_STRATEGY_DATA,
    CLEAN_ROOT_FIELDS
};