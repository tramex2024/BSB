server/src/ai/StrategyManager.js

const { ADX, StochasticRSI, EMA } = require('technicalindicators');

class StrategyManager {
    static calculate(history) {
        if (!history || history.length < 50) return null;

        const closeValues = history.map(c => parseFloat(c.close));
        const highValues = history.map(c => parseFloat(c.high));
        const lowValues = history.map(c => parseFloat(c.low));
        
        // 1. ADX - Fuerza de tendencia
        const adxResult = ADX.calculate({
            high: highValues,
            low: lowValues,
            close: closeValues,
            period: 14
        });
        const latestADXData = adxResult[adxResult.length - 1];
        const latestADX = latestADXData ? latestADXData.adx : 0;

        // 2. Stochastic RSI - Momentum
        const stochResult = StochasticRSI.calculate({
            values: closeValues,
            rsiPeriod: 14,
            stochasticPeriod: 14,
            kPeriod: 3,
            dPeriod: 3
        });
        const latestStoch = stochResult[stochResult.length - 1];
        const prevStoch = stochResult[stochResult.length - 2];

        // 3. EMAs - Estructura de mercado
        const ema9 = EMA.calculate({ period: 9, values: closeValues });
        const ema21 = EMA.calculate({ period: 21, values: closeValues });
        const ema50 = EMA.calculate({ period: 50, values: closeValues });
        
        const lastEma9 = ema9[ema9.length - 1];
        const lastEma21 = ema21[ema21.length - 1];
        const lastEma50 = ema50[ema50.length - 1];
        const currentPrice = closeValues[closeValues.length - 1];

        // Lógica de cruces
        const isBullishCross = lastEma9 > lastEma21;
        const isAboveLongTerm = currentPrice > lastEma50;

        // --- SISTEMA DE PUNTUACIÓN OPTIMIZADO ---
        let score = 0;

        // Criterio 1: Estructura EMA (Base de la señal)
        if (isAboveLongTerm) {
            score += 30; // Tendencia macro alcista
            if (isBullishCross) score += 20; // Momentum de corto plazo
        } else {
            score -= 25; // Penalización agresiva si estamos bajo la EMA50
        }

        // Criterio 2: Momentum Stochastic RSI
        if (latestStoch && prevStoch) {
            const kDiff = latestStoch.k - prevStoch.k;
            
            if (latestStoch.k < 20 && kDiff > 2) {
                score += 35; // COMPRA: Salida de sobreventa extrema (Oro puro)
            } else if (latestStoch.k < 50 && kDiff > 5) {
                score += 15; // Momentum ascendente
            } else if (latestStoch.k > 85) {
                score -= 45; // BLOQUEO: Riesgo de retroceso inmediato
            }
        }

        // Criterio 3: Filtro de Volatilidad ADX
        if (latestADX > 22) {
            score += 15; // Hay tendencia clara
        } else if (latestADX < 15) {
            score -= 30; // MERCADO MUERTO: Evitar señales falsas por falta de volumen
        }

        // Normalización (0.0 a 1.0)
        const confidence = Math.max(0, Math.min(1, score / 100));

        return {
            rsi: latestStoch ? latestStoch.k : 50,
            adx: latestADX,
            trend: isAboveLongTerm ? 'bullish' : 'bearish',
            confidence: confidence,
            price: currentPrice,
            ema9: lastEma9,
            ema21: lastEma21,
            ema50: lastEma50,
            message: this._generateMessage(isAboveLongTerm, latestADX, latestStoch, confidence)
        };
    }

    static _generateMessage(bullish, adx, stoch, conf) {
        if (conf >= 0.85) return "🚀 ALTA CONFIANZA: Patrón Neural Detectado.";
        if (stoch && stoch.k > 80) return "⚠️ MOMENTUM AGOTADO: Esperando corrección.";
        if (adx < 18) return "😴 RANGO LATERAL: Sin fuerza para operar.";
        if (!bullish) return "📉 FILTRO EMA: Tendencia principal bajista.";
        if (conf > 0.6) return "⚖️ SEÑAL DÉBIL: Esperando confirmación.";
        return "🔍 ESCANEANDO: Buscando anomalías de mercado...";
    }
}

module.exports = StrategyManager;