// BSB/server/src/au/utils/cleanState.js

/**
 * 2026 MIGRATION - FLAT ARCHITECTURE
 * This file defines the 'ZERO' state for each strategy.
 * Applied when a cycle finishes (Take Profit) or when the bot is reset.
 */

/**
 * Reset values for LONG strategy (Acroynms starting with 'l')
 */
const CLEAN_LONG_ROOT = {
    lppc: 0,          // Long Price Per Coin (Average Buy Price)
    lac: 0,           // Long Accumulated Coins (BTC accumulated)
    lai: 0,           // Long Accumulated Investment (USDT spent)
    locc: 0,          // Long Order Cycle Count (Counter for exponential logic)
    llastOrder: null, // Clear pending orders from Bitmart
    lpm: 0,           // Long Price Max (Trailing Peak reset)
    lpc: 0,           // Long Price Cut (Trailing Stop reset)
    lstartTime: null, // Initial timestamp reset
    lrca: 0,          // Long Required Coverage Amount (Next DCA USDT)
    lncp: 0,          // Long Next Coverage Price (DCA trigger price)
    ltprice: 0,       // UI Target Price
    lsprice: 0,       // UI Stop Price
    lprofit: 0,       // PNL accumulated in current cycle
    lnorder: 0,       // UI Order counter
    lcoverage: 0,     // UI Resistance/Coverage price
    llep: 0           // Last Execution Price (Prevents duplicate order loops)
};

/**
 * Reset values for SHORT strategy (Acronyms starting with 's')
 */
const CLEAN_SHORT_ROOT = {
    sppc: 0,          // Short Price Per Coin (Average Sell Price)
    sac: 0,           // Short Accumulated Coins (Debt/Contract size)
    sai: 0,           // Short Accumulated Investment (USDT Collateral)
    socc: 0,          // Short Order Cycle Count (Counter for exponential logic)
    slastOrder: null, // Clear pending orders from Bitmart
    spm: 0,           // Short Price Min (Trailing Floor reset)
    spc: 0,           // Short Price Cut (Trailing Buyback reset)
    sstartTime: null, // Initial timestamp reset
    srca: 0,          // Short Required Coverage Amount
    sncp: 0,          // Short Next Coverage Price (DCA trigger if price rises)
    stprice: 0,       // UI Target Price
    sbprice: 0,       // UI Buyback/Stop Price
    sprofit: 0,       // PNL accumulated in current cycle
    snorder: 0,       // UI Order counter
    scoverage: 0,     // UI Resistance/Coverage price
    slep: 0           // Last Execution Price (Prevents duplicate order loops)
};

module.exports = {
    CLEAN_LONG_ROOT,
    CLEAN_SHORT_ROOT
};