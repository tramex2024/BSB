// BSB/server/src/au/engines/StrategyManager.js

const { ADX, StochasticRSI, EMA } = require('technicalindicators');

class StrategyManager {
    static calculate(history) {
        // Mínimo 200 velas para que la EMA 200 sea precisa
        if (!history || history.length < 200) return null;

        const closeValues = history.map(c => parseFloat(c.close));
        const highValues = history.map(c => parseFloat(c.high));
        const lowValues = history.map(c => parseFloat(c.low));
        
        try {
            // 1. ADX - Fuerza de la tendencia
            const adxResult = ADX.calculate({
                high: highValues, low: lowValues, close: closeValues, period: 14
            });
            const latestADX = adxResult.length > 0 ? adxResult[adxResult.length - 1].adx : 0;

            // 2. Stochastic RSI - Momentum y Timing
            const stochResult = StochasticRSI.calculate({
                values: closeValues, rsiPeriod: 14, stochasticPeriod: 14, kPeriod: 3, dPeriod: 3
            });
            
            if (stochResult.length < 2) return null; // Evitar error si no hay suficientes resultados
            const latestStoch = stochResult[stochResult.length - 1];
            const prevStoch = stochResult[stochResult.length - 2];

            // 3. EMAs - Filtro de Estructura Institucional
            const ema9 = EMA.calculate({ period: 9, values: closeValues });
            const ema21 = EMA.calculate({ period: 21, values: closeValues });
            const ema200 = EMA.calculate({ period: 200, values: closeValues });
            
            const lastEma9 = ema9[ema9.length - 1];
            const lastEma21 = ema21[ema21.length - 1];
            const lastEma200 = ema200[ema200.length - 1];
            const currentPrice = closeValues[closeValues.length - 1];

            // Diagnóstico de tendencia
            const isBullishCross = lastEma9 > lastEma21;
            const isAboveInstitutional = currentPrice > lastEma200;

            // --- SCORE ENGINE ---
            let score = 0;

            // A: Tendencia Macro (40%)
            if (isAboveInstitutional) {
                score += 30; 
                if (isBullishCross) score += 10;
            } else {
                score -= 30; // Bloqueo de compras en tendencia bajista macro
            }

            // B: Momentum (40%)
            if (latestStoch && prevStoch) {
                const kDiff = latestStoch.k - prevStoch.k;
                // Sobrevendido con giro alcista
                if (latestStoch.k < 25 && kDiff > 3) score += 40;
                // Sobrecomprado (Penalización por riesgo de reversión)
                else if (latestStoch.k > 80) score -= 50;
                // Impulso alcista medio
                else if (kDiff > 5) score += 15;
            }

            // C: Volatilidad ADX (20%)
            if (latestADX > 25) score += 20; 
            else if (latestADX < 15) score -= 40; // Rango lateral = Peligro de señales falsas

            // Normalización de Confianza (0.0 a 1.0)
            const confidence = Math.max(0, Math.min(1, score / 100));

            return {
                rsiK: latestStoch?.k || 50,
                adx: latestADX,
                trend: isAboveInstitutional ? 'bullish' : 'bearish',
                confidence: confidence,
                price: currentPrice,
                message: this._generateMessage(isAboveInstitutional, latestADX, latestStoch, confidence)
            };
        } catch (e) {
            console.error("❌ Error Matemático en StrategyManager:", e);
            return null;
        }
    }

    static _generateMessage(bullish, adx, stoch, conf) {
        if (conf >= 0.85) return "🚀 ALTA CONFIANZA: Alineación técnica total.";
        if (stoch && stoch.k > 80) return "⚠️ AGOTAMIENTO: El precio está sobreextendido.";
        if (adx < 18) return "😴 BAJO VOLUMEN: Mercado lateral o inactivo.";
        if (!bullish) return "📉 FILTRO MACRO: Tendencia bajista dominante.";
        return "🔍 ESCANEANDO: Buscando confluencia óptima...";
    }
}

module.exports = StrategyManager;