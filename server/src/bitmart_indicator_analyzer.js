// server/bitmart_indicator_analyzer.js

const { RSI } = require('technicalindicators');
const fs = require('fs').promises;
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
            console.error("[ANALYZER] No se recibieron datos de velas.");
            return [];
        }

        return rawCandlesData.map(c => ({
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close),
            volume: Number(c.volume)
        })).filter(c => !isNaN(c.close));

    } catch (error) {
        console.error(`[ANALYZER] ❌ Error obteniendo velas: ${error.message}`);
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
 * DETERMINA LA SEÑAL (Cerebro de la estrategia)
 * Ahora devuelve RSI numérico para la Base de Datos.
 */
function determineEntryPoint(candlesWithIndicators, currentPrice, symbol = SYMBOL) {
    // 1. Objeto por defecto (HOLD)
    const result = {
        action: "HOLD",
        symbol: symbol,
        currentRSI: 0,
        lastCompleteCandleRSI: 0,
        reason: "Esperando condiciones de mercado...",
        timestamp: new Date().toISOString()
    };

    if (candlesWithIndicators.length < 2) {
        result.reason = "Datos insuficientes para análisis.";
        return result;
    }

    // RSI de la última vela cerrada
    const lastCompleteCandle = candlesWithIndicators[candlesWithIndicators.length - 1];
    const lastCompleteCandleRSI = lastCompleteCandle.rsi;

    // RSI Actual calculado con el precio en tiempo real
    const allPrices = candlesWithIndicators.map(c => c.close);
    allPrices.push(currentPrice);
    const latestRsiValues = RSI.calculate({ values: allPrices, period: RSI_PERIOD });
    const currentRSI = latestRsiValues[latestRsiValues.length - 1];

    // Guardamos los valores numéricos en el resultado
    result.currentRSI = currentRSI;
    result.lastCompleteCandleRSI = lastCompleteCandleRSI;

    // --- LÓGICA DE COMPRA ---
    if (lastCompleteCandleRSI <= RSI_OVERSOLD && currentRSI > RSI_OVERSOLD) {
        result.action = "BUY";
        result.reason = `COMPRA: RSI cruzó ${RSI_OVERSOLD} al alza (${lastCompleteCandleRSI.toFixed(2)} -> ${currentRSI.toFixed(2)})`;
    } 
    else if (currentRSI < RSI_OVERSOLD && currentRSI > lastCompleteCandleRSI) {
        result.action = "BUY";
        result.reason = `COMPRA: RSI en sobreventa subiendo (${currentRSI.toFixed(2)})`;
    }

    // --- LÓGICA DE VENTA ---
    else if (lastCompleteCandleRSI >= RSI_OVERBOUGHT && currentRSI < RSI_OVERBOUGHT) {
        result.action = "SELL";
        result.reason = `VENTA: RSI cruzó ${RSI_OVERBOUGHT} a la baja`;
    }
    else if (currentRSI > RSI_OVERBOUGHT && currentRSI < lastCompleteCandleRSI) {
        result.action = "SELL";
        result.reason = `VENTA: RSI en sobrecompra bajando (${currentRSI.toFixed(2)})`;
    }

    return result;
}

/**
 * FUNCIÓN PRINCIPAL
 */
async function runAnalysis(currentPriceFromBotLogic) {
    try {
        const rawCandles = await getCandles(SYMBOL, '1', 500);
        if (rawCandles.length === 0) return { action: "HOLD", reason: "Error de conexión con BitMart" };

        // Ignoramos la última vela de la API para usar nuestro currentPrice fresco
        const candlesForAnalysis = rawCandles.slice(0, -1);
        const candlesWithIndicators = calculateIndicators(candlesForAnalysis);

        const signal = determineEntryPoint(candlesWithIndicators, currentPriceFromBotLogic, SYMBOL);

        // Guardamos copia en JSON por seguridad (opcional)
        await fs.writeFile("bitmart_entry_point.json", JSON.stringify(signal, null, 4));

        return signal;

    } catch (error) {
        console.error("[ANALYZER] Error crítico:", error);
        return { action: "HOLD", reason: "Error interno del analizador" };
    }
}

module.exports = { runAnalysis };