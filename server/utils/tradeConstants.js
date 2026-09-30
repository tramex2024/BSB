/**
 * BSB/server/src/utils/tradeConstants.js
 * BITMART TECHNICAL TRADING CONFIGURATION
 * These constants govern minimum limits and fee calculations.
 * They are universal for all users within the system.
 */

const TRADE_SYMBOL = 'BTC_USDT';

/**
 * BitMart requires a minimum of 5.00 USDT for market orders.
 * We use 6.00 as a safety margin to avoid rejections caused by 
 * millisecond price fluctuations or micro-fee deductions.
 */
const MIN_USDT_VALUE_FOR_BITMART = 6.00;

/**
 * BitMart minimum BTC limit for selling/closing positions.
 */
const MIN_SELL_AMOUNT_BTC = 0.00005;

/**
 * Standard BitMart Trading Fees (0.1%).
 * Used across DataManagers to calculate real Net Profit.
 */
const BUY_FEE_PERCENT = 0.001; 
const SELL_FEE_PERCENT = 0.001; 

/**
 * Trailing Stop fijo utilizado en la operativa.
 * Valor: 0.15% (0.0015 en formato decimal).
 */
const TRAILING_STOP_PERCENT = 0.0015; // 0.15%

/**
 * Precision requirements for BitMart API (BTC_USDT pair).
 * BTC (Qty): 6 decimals (e.g., 0.000123)
 * USDT (Price/Amount): 2 decimals (e.g., 50000.50)
 */
const BTC_PRECISION = 6;
const USDT_PRECISION = 2;

/**
 * AI Risk Manager Configuration Limits.
 */
const AI_MIN_TRADE_AMOUNT = 5.0;
const AI_SAFETY_MARGIN = 0.02;

/**
 * Maximum capital cap per strategy side (Long/Short).
 */
const MAX_CAP = 6140.0;

/**
 * Exponential Grid / Autobot Calculation Limits & Defaults (2026 Logic)
 */
const MAX_ALLOWED_ORDERS = 30;
const DEFAULT_START_STEP = 0.015;
const DEFAULT_TARGET_COVERAGE = 0.18;

module.exports = {
    TRADE_SYMBOL,
    MIN_USDT_VALUE_FOR_BITMART,
    MIN_SELL_AMOUNT_BTC,
    BUY_FEE_PERCENT,
    SELL_FEE_PERCENT,
    TRAILING_STOP_PERCENT,
    BTC_PRECISION,
    USDT_PRECISION,
    AI_MIN_TRADE_AMOUNT,
    AI_SAFETY_MARGIN,
    MAX_ALLOWED_ORDERS,
    DEFAULT_START_STEP,
    DEFAULT_TARGET_COVERAGE,
    MAX_CAP
};