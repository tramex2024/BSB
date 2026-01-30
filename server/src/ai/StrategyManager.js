const { ADX, StochasticRSI, EMA } = require('technicalindicators');

class StrategyManager {
    static calculate(history) {
        // Ahora history.length siempre será ~50 gracias al CentralAnalyzer
        if (history.length < 30) return null;

        const closeValues = history.map(c => c.close);
        const highValues = history.map(c => c.high);
        const lowValues = history.map(c => c.low);
        
        // 1. ADX (Fuerza de tendencia)
        const adxResult = ADX.calculate({
            high: highValues,
            low: lowValues,
            close: closeValues,
            period: 14
        });
        const latestADX = adxResult[adxResult.length - 1];

        // 2. Stochastic RSI (Momentum)
        const stochResult = StochasticRSI.calculate({
            values: closeValues,
            rsiPeriod: 14,
            stochasticPeriod: 14,
            kPeriod: 3,
            dPeriod: 3
        });
        const latestStoch = stochResult[stochResult.length - 1];

        // 3. EMAs (Dirección)
        const ema9 = EMA.calculate({ period: 9, values: closeValues });
        const ema21 = EMA.calculate({ period: 21, values: closeValues });
        const isBullish = ema9[ema9.length - 1] > ema21[ema21.length - 1];

        // --- SISTEMA DE PUNTUACIÓN DE CONFIANZA ---
        let score = 0;
        let totalWeight = 0;

        // Criterio 1: Tendencia (EMA) - Peso: 40%
        totalWeight += 40;
        if (isBullish) score += 40;

        // Criterio 2: Momentum (Stochastic RSI) - Peso: 30%
        totalWeight += 30;
        // Si K < 20 (Sobreventa) y está subiendo
        if (latestStoch && latestStoch.k < 25) score += 30;
        else if (latestStoch && latestStoch.k < 50) score += 15; // Zona neutral-baja

        // Criterio 3: Fuerza (ADX) - Peso: 30%
        totalWeight += 30;
        if (latestADX && latestADX.adx > 25) score += 30; // Tendencia fuerte
        else if (latestADX && latestADX.adx > 18) score += 15; // Iniciando tendencia

        const confidence = score / totalWeight;

        return {
            rsi: latestStoch ? latestStoch.k : 50, // Usamos K como referencia de RSI
            adx: latestADX ? latestADX.adx : 0,
            trend: isBullish ? 'bullish' : 'bearish',
            confidence: confidence, // <--- Esto es lo que el AIEngine necesita
            price: closeValues[closeValues.length - 1]
        };
    }
}

module.exports = StrategyManager;