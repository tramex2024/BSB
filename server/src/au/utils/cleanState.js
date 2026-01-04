// BSB/server/src/au/utils/cleanState.js (VERSIÓN SEGMENTADA)

/**
 * Objeto que representa el estado limpio y inicializado de los datos de la estrategia.
 * Se mantiene genérico porque se asigna individualmente a 'lStateData' o 'sStateData'.
 */
const CLEAN_STRATEGY_DATA = {
    ppc: 0, 
    ac: 0,  
    ai: 0,  
    orderCountInCycle: 0, 
    lastOrder: null, 
    pm: 0,  
    pc: 0,  
    lastExecutionPrice: 0, 
    requiredCoverageAmount: 0, 
    nextCoveragePrice: 0, 
    cycleStartTime: null 
};

/**
 * CAMPOS RAÍZ ESPECÍFICOS PARA LONG
 */
const CLEAN_LONG_ROOT = {
    ltprice: 0,
    lsprice: 0,
    lprofit: 0,
    lnorder: 0,
    lcoverage: 0
};

/**
 * CAMPOS RAÍZ ESPECÍFICOS PARA SHORT
 */
const CLEAN_SHORT_ROOT = {
    stprice: 0,
    sbprice: 0,
    sprofit: 0,
    snorder: 0,
    scoverage: 0
};

/**
 * Objeto heredado para compatibilidad (Legacy)
 * Si alguna parte del código aún llama a CLEAN_ROOT_FIELDS, 
 * unimos ambos para que no falle, aunque el plan es dejar de usarlo.
 */
const CLEAN_ROOT_FIELDS = {
    ...CLEAN_LONG_ROOT,
    ...CLEAN_SHORT_ROOT
};

module.exports = {
    CLEAN_STRATEGY_DATA,
    CLEAN_LONG_ROOT,
    CLEAN_SHORT_ROOT,
    CLEAN_ROOT_FIELDS // Mantenido por precaución
};