// BSB/server/src/au/utils/cleanState.js (CORREGIDO)

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

const CLEAN_LONG_ROOT = {
    ltprice: 0,
    lsprice: 0,
    lprofit: 0,
    lnorder: 0,
    lcoverage: 0
    // lstate eliminado: el estado lo decide tu lógica de ciclo
};

const CLEAN_SHORT_ROOT = {
    stprice: 0,
    sbprice: 0,
    sprofit: 0,
    snorder: 0,
    scoverage: 0
    // sstate eliminado
};

module.exports = {
    CLEAN_STRATEGY_DATA,
    CLEAN_LONG_ROOT,
    CLEAN_SHORT_ROOT
};