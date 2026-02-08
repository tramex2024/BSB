// BSB/server/src/au/utils/tradeConstants.js

/**
 * CONFIGURACIÓN TÉCNICA DE TRADING - BITMART
 * Estas constantes rigen los límites mínimos y cálculos de comisiones.
 * Son universales para todos los usuarios del sistema.
 */

const TRADE_SYMBOL = 'BTC_USDT';

/**
 * BitMart requiere un mínimo de 5.00 USDT para órdenes de mercado.
 * Usamos 6.00 como margen de seguridad para evitar rechazos por fluctuaciones 
 * de milisegundos en el precio o descuentos de micro-comisiones.
 */
const MIN_USDT_VALUE_FOR_BITMART = 6.00;

/**
 * Comisiones estándar de BitMart (0.1%).
 * Se utilizan en los DataManagers para calcular el Profit Neto real.
 */
const BUY_FEE_PERCENT = 0.001; 
const SELL_FEE_PERCENT = 0.001; 

/**
 * Precisiones requeridas por la API de BitMart para el par BTC_USDT.
 * BTC (Qty): 6 decimales (ej. 0.000123)
 * USDT (Price/Amount): 2 decimales (ej. 50000.50)
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