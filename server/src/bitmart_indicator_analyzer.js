// server/bitmart_indicator_analyzer.js

const { RSI } = require('technicalindicators');
const bitmartService = require('../services/bitmartService');

const SYMBOL = 'BTC_USDT';

// --- Configuración de Indicadores ---
const RSI_PERIOD = 21;
const RSI_OVERSOLD = 30;
const RSI_OVERBOUGHT = 70;

/**
 * Obtiene velas desde BitMart
 */
async function getCandles(symbol, interval, size = 500) {
    try {
        const rawCandlesData = await bitmartService.getKlines(symbol, interval, size);

        if (!rawCandlesData || rawCandlesData.length === 0) {
            return [];
        }

        return rawCandlesData.map(c => ({
            open: parseFloat(c.open),
            high: parseFloat(c.high),
            low: parseFloat(c.low),
            close: parseFloat(c.close),
            volume: parseFloat(c.volume)
        })).filter(c => !isNaN(c.close));

    } catch (error) {
        console.error(`[ANALYZER] ❌ Error en getCandles: ${error.message}`);
        return [];
    }
}

/**
 * Calcula los indicadores
 */
function calculateIndicators(candles) {
    if (candles.length < RSI_PERIOD + 1) return [];

    const closePrices = candles.map(c => c.close);
    const rsiValues = RSI.calculate({ values: closePrices, period: RSI_PERIOD });
    const rsiOffset = candles.length - rsiValues.length;

    return candles.slice(rsiOffset).map((candle, idx) => ({
        ...candle,
        rsi: rsiValues[idx]
    }));
}

/**
 * DETERMINA LA SEÑAL
 */
function determineEntryPoint(candlesWithIndicators, currentPrice, symbol = SYMBOL) {
    const result = {
        action: "HOLD",
        symbol: symbol,
        currentRSI: 0,
        lastCompleteCandleRSI: 0,
        reason: "Analizando mercado...",
        timestamp: new Date().toISOString()
    };

    if (candlesWithIndicators.length < 2) {
        result.reason = "Datos insuficientes.";
        return result;
    }

    const lastCompleteCandle = candlesWithIndicators[candlesWithIndicators.length - 1];
    const lastCompleteCandleRSI = lastCompleteCandle.rsi;

    const allPrices = candlesWithIndicators.map(c => c.close);
    allPrices.push(parseFloat(currentPrice));
    
    const latestRsiValues = RSI.calculate({ values: allPrices, period: RSI_PERIOD });
    const currentRSI = latestRsiValues[latestRsiValues.length - 1];

    result.currentRSI = currentRSI || 0;
    result.lastCompleteCandleRSI = lastCompleteCandleRSI || 0;

    // --- LÓGICA DE SEÑALES ---
    if (lastCompleteCandleRSI <= RSI_OVERSOLD && currentRSI > RSI_OVERSOLD) {
        result.action = "BUY";
        result.reason = `RSI cruzó ${RSI_OVERSOLD} al alza`;
    } 
    else if (currentRSI < RSI_OVERSOLD && currentRSI > lastCompleteCandleRSI) {
        result.action = "BUY";
        result.reason = `RSI en sobreventa subiendo`;
    }
    else if (lastCompleteCandleRSI >= RSI_OVERBOUGHT && currentRSI < RSI_OVERBOUGHT) {
        result.action = "SELL";
        result.reason = `RSI cruzó ${RSI_OVERBOUGHT} a la baja`;
    }
    else if (currentRSI > RSI_OVERBOUGHT && currentRSI < lastCompleteCandleRSI) {
        result.action = "SELL";
        result.reason = `RSI en sobrecompra bajando`;
    }

    return result;
}

/**
 * FUNCIÓN PRINCIPAL
 */
async function runAnalysis(currentPriceFromBotLogic) {
    try {
        // Obtenemos velas de 1 minuto
        const rawCandles = await getCandles(SYMBOL, '1', 100); 
        if (rawCandles.length === 0) {
            return { action: "HOLD", reason: "Sin datos de velas", currentRSI: 0 };
        }

        const candlesForAnalysis = rawCandles.slice(0, -1);
        const candlesWithIndicators = calculateIndicators(candlesForAnalysis);

        return determineEntryPoint(candlesWithIndicators, currentPriceFromBotLogic, SYMBOL);

    } catch (error) {
        console.error("[ANALYZER] Error:", error.message);
        return { action: "HOLD", reason: "Error en análisis", currentRSI: 0 };
    }
}

module.exports = { runAnalysis };