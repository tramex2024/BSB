// bitmart_indicator_analyzer.js

const technicalindicators = require('technicalindicators');
const bitmartService = require('./bitmartService'); // Asegúrate de que la ruta sea correcta
const fs = require('fs');

// Constantes de configuración (ajústalas según tu estrategia real)
const RSI_PERIOD = 14; // Período común para el RSI
const RSI_BUY_THRESHOLD = 40; // TEMPORAL PARA PRUEBAS: Normalmente 30 o 35 para sobreventa
const RSI_SELL_THRESHOLD = 70; // Umbral para sobrecompra (venta)
const CANDLE_INTERVAL = '1'; // Intervalo de velas (e.g., '1' para 1 minuto, '5' para 5 minutos)
const CANDLE_SIZE = 100; // Número de velas a obtener (necesitas suficientes para el cálculo del RSI, al menos RSI_PERIOD + un poco más)

/**
 * Calcula el Relative Strength Index (RSI).
 * @param {Array<number>} prices - Un array de precios de cierre.
 * @returns {Array<number>} - Un array con los valores de RSI calculados.
 */
function calculateRSI(prices) {
    if (prices.length < RSI_PERIOD) {
        console.warn(`[ANALYZER] No hay suficientes datos para calcular el RSI. Se requieren al menos ${RSI_PERIOD} precios.`);
        return [];
    }

    const inputRSI = {
        values: prices,
        period: RSI_PERIOD
    };

    const rsi = technicalindicators.RSI.calculate(inputRSI);
    return rsi;
}

/**
 * Ejecuta el análisis de los indicadores técnicos y genera una señal de trading.
 * @param {number} currentPrice - El precio actual del activo.
 * @param {Array<Object>} klines - Un array de objetos de velas (candlesticks).
 * @returns {Object} La señal de trading { action: 'BUY' | 'SELL' | 'HOLD', symbol: string, reason: string }.
 */
async function runAnalysis(currentPrice, klines) {
    console.log(`[ANALYZER] --- Iniciando análisis para BTC_USDT. Precio actual recibido: ${currentPrice} ---`);

    if (!klines || klines.length === 0) {
        console.warn('[ANALYZER] No se recibieron velas (klines) para el análisis. Devolviendo HOLD.');
        return { action: 'HOLD', symbol: 'BTC_USDT', reason: 'No hay datos de velas para analizar.' };
    }

    // Tomar las velas necesarias para los cálculos.
    // La última vela puede estar incompleta, por lo que es común ignorarla para cálculos de indicadores.
    const reliableKlines = klines.slice(0, klines.length - 1);
    console.log(`[ANALYZER-DEBUG] Se obtuvieron ${klines.length} velas de la API.`);
    console.log(`[ANALYZER-DEBUG] Se usarán ${reliableKlines.length} velas para el cálculo de indicadores (última vela de la API ignorada para seguridad).`);


    if (reliableKlines.length < RSI_PERIOD) {
        console.warn(`[ANALYZER] No hay suficientes velas completas para calcular el RSI (se requieren al menos ${RSI_PERIOD}). Devolviendo HOLD.`);
        return { action: 'HOLD', symbol: 'BTC_USDT', reason: 'No hay suficientes velas completas para el cálculo de indicadores.' };
    }

    const closingPrices = reliableKlines.map(k => parseFloat(k[4])); // El precio de cierre está en el índice 4 de la vela BitMart

    console.log(`[ANALYZER-DEBUG] Precios de cierre para RSI (${closingPrices.length} velas): ${closingPrices.map(p => p.toFixed(2)).join(', ')}`);


    const rsiValues = calculateRSI(closingPrices);

    // Si RSI tiene valores, obtenemos el último para el análisis de la última vela completa
    const rsiForLastCompleteCandle = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : null;

    // Calcular el RSI con el precio actual para una evaluación en tiempo real
    const rsiWithCurrentPrice = calculateRSI([...closingPrices, currentPrice]);
    const latestRSI = rsiWithCurrentPrice.length > 0 ? rsiWithCurrentPrice[rsiWithCurrentPrice.length - 1] : null;

    console.log(`[ANALYZER-DEBUG] calculateIndicators produjo ${rsiValues.length} velas con indicadores.`);

    if (rsiValues.length > 0) {
        console.log(`[ANALYZER-DEBUG] Últimas ${Math.min(5, rsiValues.length)} velas (con indicadores completos):`);
        for (let i = Math.max(0, rsiValues.length - 5); i < rsiValues.length; i++) {
            console.log(`[ANALYZER-DEBUG]    Cierre: ${closingPrices[i].toFixed(2)}, RSI: ${rsiValues[i].toFixed(2)}`);
        }
    }


    console.log(`[ANALYZER-DEBUG] Analizando señales - RSI Vela Anterior Completa: ${rsiForLastCompleteCandle ? rsiForLastCompleteCandle.toFixed(2) : 'N/A'}, RSI Última Vela Completa: ${rsiForLastCompleteCandle ? rsiForLastCompleteCandle.toFixed(2) : 'N/A'}, RSI (con Precio Actual): ${latestRSI ? latestRSI.toFixed(2) : 'N/A'}`);

    let signal = { action: 'HOLD', symbol: 'BTC_USDT', reason: 'No se encontraron señales de entrada o salida claras en este momento.' };

    // Lógica para señales de compra
    if (latestRSI !== null) {
        console.log(`[ANALYZER-SIGNAL-DEBUG] Evaluando RSI para COMPRA. Precio Actual RSI: ${latestRSI.toFixed(2)}, Umbral de Compra: ${RSI_BUY_THRESHOLD}`);
        // Condición de compra: RSI por debajo del umbral
        if (latestRSI < RSI_BUY_THRESHOLD) {
            signal = {
                action: 'BUY',
                symbol: 'BTC_USDT',
                reason: `RSI (${latestRSI.toFixed(2)}) está por debajo del umbral de compra (${RSI_BUY_THRESHOLD}).`
            };
        }
        // Lógica para señales de venta (mantengo el umbral original pero puedes ajustarlo para pruebas si quieres ver ventas)
        else if (latestRSI > RSI_SELL_THRESHOLD) {
            console.log(`[ANALYZER-SIGNAL-DEBUG] Evaluando RSI para VENTA. Precio Actual RSI: ${latestRSI.toFixed(2)}, Umbral de Venta: ${RSI_SELL_THRESHOLD}`);
            signal = {
                action: 'SELL',
                symbol: 'BTC_USDT',
                reason: `RSI (${latestRSI.toFixed(2)}) está por encima del umbral de venta (${RSI_SELL_THRESHOLD}).`
            };
        }
    }


    console.log('[ANALYZER] --- Señal de Trading Generada ---');
    console.log(signal);

    // Opcional: Guarda la última señal generada en un archivo para depuración
    try {
        fs.writeFileSync('bitmart_entry_point.json', JSON.stringify(signal, null, 2));
        console.log(`[ANALYZER-FILE] Punto de entrada escrito en 'bitmart_entry_point.json'`);
    } catch (error) {
        console.error('[ANALYZER-FILE] Error al escribir el archivo bitmart_entry_point.json:', error);
    }

    return signal;
}

// Función para obtener las velas (wrapper para bitmartService)
async function getKlines(symbol, interval, size) {
    try {
        const klines = await bitmartService.getKlines(symbol, interval, size);
        return klines;
    } catch (error) {
        console.error(`[ANALYZER] Error al obtener velas de BitMart para ${symbol}:`, error.message);
        throw error; // Re-lanza el error para que autobotLogic lo maneje
    }
}

module.exports = {
    runAnalysis,
    getKlines
};