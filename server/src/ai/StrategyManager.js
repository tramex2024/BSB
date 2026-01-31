const { ADX, StochasticRSI, EMA } = require('technicalindicators');

class StrategyManager {
    static calculate(history) {
        // Necesitamos al menos 50 velas para que la EMA50 sea precisa
        if (!history || history.length < 50) return null;

        const closeValues = history.map(c => c.close);
        const highValues = history.map(c => c.high);
        const lowValues = history.map(c => c.low);
        
        // 1. ADX - Fuerza de tendencia
        const adxResult = ADX.calculate({
            high: highValues,
            low: lowValues,
            close: closeValues,
            period: 14
        });
        // ✅ CORRECCIÓN: ADX devuelve un objeto {adx, pdi, mdi}. Accedemos a .adx
        const latestADXData = adxResult[adxResult.length - 1];
        const latestADX = latestADXData ? latestADXData.adx : 0;

        // 2. Stochastic RSI
        const stochResult = StochasticRSI.calculate({
            values: closeValues,
            rsiPeriod: 14,
            stochasticPeriod: 14,
            kPeriod: 3,
            dPeriod: 3
        });
        const latestStoch = stochResult[stochResult.length - 1];
        const prevStoch = stochResult[stochResult.length - 2];

        // 3. EMAs
        const ema9 = EMA.calculate({ period: 9, values: closeValues });
        const ema21 = EMA.calculate({ period: 21, values: closeValues });
        const ema50 = EMA.calculate({ period: 50, values: closeValues });
        
        const lastEma9 = ema9[ema9.length - 1];
        const lastEma21 = ema21[ema21.length - 1];
        const lastEma50 = ema50[ema50.length - 1];
        const currentPrice = closeValues[closeValues.length - 1];

        // Lógica de cruces y tendencia
        const isBullishCross = lastEma9 > lastEma21;
        const isAboveLongTerm = currentPrice > lastEma50;

        // --- SISTEMA DE PUNTUACIÓN (Total Max: 100) ---
        let score = 0;

        // Criterio 1: Estructura EMA (50%)
        if (isAboveLongTerm) {
            score += 30; 
            if (isBullishCross) score += 20; 
        } else {
            score -= 20; // Penalización por tendencia bajista
        }

        // Criterio 2: Stochastic RSI (30%)
        if (latestStoch && prevStoch) {
            const kDiff = latestStoch.k - prevStoch.k;
            
            if (latestStoch.k < 25 && kDiff > 3) {
                score += 30; // Giro en sobreventa
            } else if (latestStoch.k < 50 && kDiff > 1) {
                score += 15; // Recuperación moderada
            } else if (latestStoch.k > 80) {
                score -= 40; // Bloqueo total si está sobrecomprado
            }
        }

        // Criterio 3: Fuerza ADX (20%)
        if (latestADX > 25) {
            score += 20; 
        } else if (latestADX < 18) {
            score -= 15; // Rango lateral: ignorar señales
        }

        // Normalización de confianza (0.0 a 1.0)
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
        if (conf > 0.8) return "🚀 Señal fuerte: Tendencia y Momentum alineados.";
        if (stoch && stoch.k > 80) return "⚠️ Sobrecompra: Esperando retroceso.";
        if (adx < 20) return "😴 Mercado lateral: ADX muy bajo.";
        if (!bullish) return "📉 Tendencia bajista: Buscando rebotes cortos.";
        return "⚖️ Analizando oportunidad...";
    }
}

module.exports = StrategyManager;