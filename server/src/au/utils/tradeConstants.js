// BSB/server/src/au/utils/tradeConstants.js

/**
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
 * Standard BitMart Trading Fees (0.1%).
 * Used across DataManagers to calculate real Net Profit.
 */
const BUY_FEE_PERCENT = 0.001; 
const SELL_FEE_PERCENT = 0.001; 

/**
 * Precision requirements for BitMart API (BTC_USDT pair).
 * BTC (Qty): 6 decimals (e.g., 0.000123)
 * USDT (Price/Amount): 2 decimals (e.g., 50000.50)
 */
const BTC_PRECISION = 6;
const USDT_PRECISION = 2;

module.exports = {
    TRADE_SYMBOL,
    MIN_USDT_VALUE_FOR_BITMART,
    BUY_FEE_PERCENT,
    SELL_FEE_PERCENT,
    BTC_PRECISION,
    USDT_PRECISION
};