/**
 * BSB/server/src/au/engines/StrategyManager.js
 * Cerebro Matemático - Lógica de Indicadores Confluentes
 */
const { ADX, StochasticRSI, EMA } = require('technicalindicators');

class StrategyManager {
    static calculate(history) {
        if (!history || history.length < 250) return null;

        const closeValues = history.map(c => parseFloat(c.close));
        const highValues = history.map(c => parseFloat(c.high));
        const lowValues = history.map(c => parseFloat(c.low));
        
        try {
            const adxResult = ADX.calculate({ high: highValues, low: lowValues, close: closeValues, period: 14 });
            const latestADX = adxResult.length > 0 ? adxResult[adxResult.length - 1].adx : 0;

            const stochResult = StochasticRSI.calculate({
                values: closeValues, rsiPeriod: 14, stochasticPeriod: 14, kPeriod: 3, dPeriod: 3
            });
            
            if (stochResult.length < 2) return null; 
            const latestStoch = stochResult[stochResult.length - 1];
            const prevStoch = stochResult[stochResult.length - 2];

            const ema9 = EMA.calculate({ period: 9, values: closeValues });
            const ema21 = EMA.calculate({ period: 21, values: closeValues });
            const ema200 = EMA.calculate({ period: 200, values: closeValues });
            
            const lastEma9 = ema9[ema9.length - 1];
            const lastEma21 = ema21[ema21.length - 1];
            const lastEma200 = ema200[ema200.length - 1];
            const currentPrice = closeValues[closeValues.length - 1];

            const isBullishCross = lastEma9 > lastEma21;
            const isAboveInstitutional = currentPrice > lastEma200;

            let score = 0;
            // Tendencia Institucional
            if (isAboveInstitutional) {
                score += 30; 
                if (isBullishCross) score += 10;
            } else {
                score -= 30; 
            }

            // Momentum Stochastic
            if (latestStoch && prevStoch) {
                const kDiff = latestStoch.k - prevStoch.k;
                if (latestStoch.k < 25 && kDiff > 3) score += 40;
                else if (latestStoch.k > 80) score -= 50;
                else if (kDiff > 5) score += 15;
            }

            // Volatilidad ADX
            if (latestADX > 25) score += 20; 
            else if (latestADX < 15) score -= 40;

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
            console.error("❌ Error en StrategyManager:", e);
            return null;
        }
    }

    static _generateMessage(bullish, adx, stoch, conf) {
        if (conf >= 0.85) return "🚀 ALTA CONFIANZA: Alineación técnica total.";
        if (stoch && stoch.k > 80) return "⚠️ AGOTAMIENTO: Sobrecompra detectada.";
        if (adx < 18) return "😴 BAJO VOLUMEN: El mercado no tiene fuerza.";
        if (!bullish) return "📉 FILTRO MACRO: Tendencia bajista dominante.";
        return "🔍 ESCANEANDO: Buscando confluencia óptima...";
    }
}

module.exports = StrategyManager;