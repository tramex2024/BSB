/**
 * BSB/server/src/managers/StrategyManager.js
 * Versión Híbrida: Clasificación de señal centralizada
 */
const { ADX, StochasticRSI, EMA, BollingerBands } = require('technicalindicators');

class StrategyManager {
    static calculate(history) {
        if (!history || history.length < 100) return null;

        const closeValues = history.map(c => parseFloat(c.close));
        const highValues = history.map(c => parseFloat(c.high));
        const lowValues = history.map(c => parseFloat(c.low));
        const currentPrice = closeValues[closeValues.length - 1];
        
        try {
            let score = 0;
            let triggers = [];

            // 1. BOLLINGER (45 pts)
            const bb = BollingerBands.calculate({ period: 20, values: closeValues, stdDev: 2 });
            if (bb.length > 0) {
                const lastBB = bb[bb.length - 1];
                if (currentPrice < lastBB.middle) {
                    const bbScore = Math.min(45, ((lastBB.middle - currentPrice) / (lastBB.middle - lastBB.lower)) * 45);
                    score += bbScore;
                    if (bbScore > 20) triggers.push("Volatility Pressure");
                }
            }

            // 2. STOCHASTIC RSI (40 pts)
            const stoch = StochasticRSI.calculate({ values: closeValues, rsiPeriod: 14, stochasticPeriod: 14, kPeriod: 3, dPeriod: 3 });
            if (stoch.length >= 2) {
                const lastK = stoch[stoch.length - 1].k;
                if (lastK < 50) {
                    score += ((50 - lastK) / 50) * 25;
                    if (lastK > stoch[stoch.length - 2].k) score += 15;
                    triggers.push("Momentum Pivot");
                } else if (lastK > 80) score -= ((lastK - 80) / 20) * 60;
            }

            // 3. EMA 100 & 4. ADX (15 pts)
            const ema100 = EMA.calculate({ period: 100, values: closeValues });
            const lastEma = ema100.length > 0 ? ema100[ema100.length - 1] : currentPrice;
            if (currentPrice > lastEma) score += 10;

            const adxRes = ADX.calculate({ high: highValues, low: lowValues, close: closeValues, period: 14 });
            const lastADX = adxRes.length > 0 ? adxRes[adxRes.length - 1].adx : 0;
            if (lastADX > 15) score += Math.min(5, ((lastADX - 15) / 15) * 5);

            // --- LÓGICA DE DECISIÓN CENTRALIZADA ---
            const confidence = Math.max(0, Math.min(1, score / 100));
            
            let signal = 'HOLD';
            if (score > 65) signal = 'STRONG_BUY';
            else if (score > 40) signal = 'BUY';
            else if (score < 20) signal = 'STRONG_SELL';
            else if (score < 35) signal = 'SELL';

            return {
                confidence: parseFloat(confidence.toFixed(4)),
                signal: signal, // <--- ESTO ES LO QUE LEERÁ MARKET-SIGNAL
                price: currentPrice,
                rsi14: 0, // Podrías añadir cálculo de RSI aquí si necesitas
                adx: parseFloat(lastADX.toFixed(2)),
                message: triggers.length > 0 ? triggers.join(' + ') : "Neural Scan Neutral"
            };

        } catch (e) {
            console.error("❌ StrategyManager Error:", e);
            return null;
        }
    }
}

module.exports = StrategyManager;