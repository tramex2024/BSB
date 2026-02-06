// BSB/server/src/au/utils/tradeConstants.js

/**
 * CONFIGURACIÓN TÉCNICA DE TRADING - BITMART
 * Estas constantes rigen los límites mínimos y cálculos de comisiones.
 */

const TRADE_SYMBOL = 'BTC_USDT';

// BitMart requiere un mínimo de 5.00 USDT para órdenes de mercado.
// 💡 Sugerencia: Usar 5.05 o 5.10 da un pequeño margen de seguridad contra fluctuaciones de precio.
const MIN_USDT_VALUE_FOR_BITMART = 5.00;

// Comisiones estándar de BitMart (0.1%)
const BUY_FEE_PERCENT = 0.001; 
const SELL_FEE_PERCENT = 0.001; 

// Precisiones (Útiles para formatear strings antes de enviar a la API)
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