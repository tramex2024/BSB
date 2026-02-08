// BSB/server/src/au/utils/cleanState.js

/**
 * MIGRACIÓN 2026 - ARQUITECTURA PLANA
 * Este archivo define el estado 'CERO' de cada estrategia.
 * Se aplica al finalizar un ciclo (Take Profit) o al reiniciar el bot.
 */

/**
 * Valores de reseteo para la estrategia LONG (Siglas l...)
 */
const CLEAN_LONG_ROOT = {
    lppc: 0,          // Long Price Per Coin (Precio promedio compra)
    lac: 0,           // Long Accumulated Coins (BTC acumulado)
    lai: 0,           // Long Accumulated Investment (USDT invertido)
    locc: 0,          // Long Order Cycle Count (Contador para lógica exponencial)
    llastOrder: null, // Limpieza de rastro de órdenes en Bitmart
    lpm: 0,           // Long Price Max (Reset para nuevo Trailing)
    lpc: 0,           // Long Price Cut (Reset para nuevo Trailing)
    lstartTime: null, // Reset de marca de tiempo de inicio
    lrca: 0,          // Long Required Coverage Amount (Próxima compra USDT)
    lncp: 0,          // Long Next Coverage Price (Próximo gatillo DCA)
    ltprice: 0,       // Target Price visual
    lsprice: 0,       // Stop Price visual
    lprofit: 0,       // Profit acumulado en el ciclo actual
    lnorder: 0,       // Contador visual de órdenes
    lcoverage: 0,     // Precio de resistencia/cobertura visual
    llep: 0           // Last Execution Price (Evita loops de órdenes duplicadas)
};

/**
 * Valores de reseteo para la estrategia SHORT (Siglas s...)
 */
const CLEAN_SHORT_ROOT = {
    sppc: 0,          // Short Price Per Coin (Precio promedio venta)
    sac: 0,           // Short Accumulated Coins (Deuda/Contrato)
    sai: 0,           // Short Accumulated Investment (USDT colateral)
    socc: 0,          // Short Order Cycle Count (Contador para lógica exponencial)
    slastOrder: null, // Limpieza de rastro de órdenes en Bitmart
    spm: 0,           // Short Price Min (Reset para Trailing Short)
    spc: 0,           // Short Price Cut (Reset para Trailing Short)
    sstartTime: null, // Reset de marca de tiempo
    srca: 0,          // Short Required Coverage Amount
    sncp: 0,          // Short Next Coverage Price (Gatillo DCA si el precio sube)
    stprice: 0,       // Target Price visual
    sbprice: 0,       // Stop/Buy Price visual (Dashboard)
    sprofit: 0,       // Profit acumulado en el ciclo actual
    snorder: 0,       // Contador visual de órdenes
    scoverage: 0,     // Precio de resistencia/cobertura visual
    slep: 0           // Last Execution Price (Evita loops de órdenes duplicadas)
};

module.exports = {
    CLEAN_LONG_ROOT,
    CLEAN_SHORT_ROOT
};