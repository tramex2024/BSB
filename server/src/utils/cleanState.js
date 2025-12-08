// BSB/server/src/utils/cleanState.js (VERSIÓN FINAL CORREGIDA)

/**
 * Objeto que representa el estado limpio y inicializado de los datos de la estrategia (Long o Short).
 * Usado después de una venta exitosa o al detener (STOP) la estrategia.
 * NOTA: Corresponde al campo 'lStateData' o 'sStateData'.
 */
const CLEAN_STRATEGY_DATA = {
    ppc: 0, // Precio Promedio (Compra o Short)
    ac: 0,  // Cantidad Acumulada
    ai: 0,  // ✅ CRÍTICO: Inversión Acumulada (Debe ser cero al inicio)
    orderCountInCycle: 0, // Contador de órdenes en el ciclo
    lastOrder: null, // Información de la última orden (limpiar)
    pm: 0,  // Long/Short: Precio Máximo/Mínimo (Para Trailing Stop)
    pc: 0,  // Precio de Corte (Trailing Stop/Protección)
    
    // ✅ FALTANTES CRÍTICOS: Se usaban para la lógica de cobertura/siguiente paso
    lastExecutionPrice: 0, // Precio de la ultima ejecución (Debe ser 0)
    requiredCoverageAmount: 0, // Monto de la próxima orden de cobertura (Debe ser 0, se recalcula)
    nextCoveragePrice: 0, // Precio de la próxima orden de cobertura (Debe ser 0, se recalcula)
    
    cycleStartTime: null // LIMPIAR EL START TIME
};

/**
 * Objeto que contiene todos los campos de nivel raíz que deben reiniciarse
 * al comienzo de un nuevo ciclo o al detener la estrategia.
 * NOTA: Corresponden a los campos del objeto principal (root level).
 */
const CLEAN_ROOT_FIELDS = {
    // Targets de Venta/Compra
    ltprice: 0,       // Target de Venta Long
    stprice: 0,       // Target de Compra Short
    
    // Trailing Stop Prices
    lsprice: 0,       // Precio de Venta Long (Trailing Stop)
    sbprice: 0,       // Precio de Compra Short (Trailing Stop)
    
    // Ganancias del ciclo (Debe ser 0 al inicio del nuevo ciclo)
    lprofit: 0,       
    sprofit: 0,
    
    // ✅ FALTANTES CRÍTICOS: Se usan para la gestión de órdenes en algunos sistemas
    // Estos campos representan la orden base / orden activa de la capa raíz.
    lnorder: 0,       // Limpiar el contador de la orden actual de compra (Long)
    snorder: 0,       // Limpiar el contador de la orden actual de compra (Short)
    
    // ✅ FALTANTES CRÍTICOS: Se usaban para la gestión de cobertura
    lcoverage: 0,     // Limpiar el monto de cobertura pendiente Long
    scoverage: 0,     // Limpiar el monto de cobertura pendiente Short
};

module.exports = {
    CLEAN_STRATEGY_DATA,
    CLEAN_ROOT_FIELDS
};