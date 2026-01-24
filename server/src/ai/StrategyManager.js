const { ADX, StochasticRSI, EMA } = require('technicalindicators');

class StrategyManager {
    static calculate(history, period = 14) {
        if (history.length < 30) return null; // Seguridad de datos suficientes

        const closeValues = history.map(c => c.close);
        
        const input = {
            high: history.map(c => c.high),
            low: history.map(c => c.low),
            close: closeValues,
            period: period
        };

        // 1. ADX: Mide la fuerza de la tendencia
        const adxResult = ADX.calculate(input);
        const latestADX = adxResult[adxResult.length - 1];

        // 2. StochasticRSI: Mide el momentum (Sobrecompra/Sobreventa)
        const stochInput = {
            values: closeValues,
            rsiPeriod: 14,
            stochasticPeriod: 14,
            kPeriod: 3,
            dPeriod: 3
        };
        const stochResult = StochasticRSI.calculate(stochInput);
        const latestStoch = stochResult[stochResult.length - 1];

        // 3. EMA 9 y 21: Filtro de dirección de tendencia (Cruces)
        // Solo compramos si la EMA rápida está por encima de la lenta
        const ema9 = EMA.calculate({ period: 9, values: closeValues });
        const ema21 = EMA.calculate({ period: 21, values: closeValues });
        
        const trendAlignment = ema9[ema9.length - 1] > ema21[ema21.length - 1];

        // 4. Análisis de Volumen: ¿Hay interés real?
        const volumes = history.map(c => c.volume);
        const avgVolume = volumes.slice(-10).reduce((a, b) => a + b, 0) / 10;
        const currentVolume = volumes[volumes.length - 1];
        const highVolume = currentVolume > avgVolume * 1.2; // 20% más que el promedio

        return { 
            adx: latestADX, 
            stoch: latestStoch,
            isBullish: trendAlignment,
            isHighVolume: highVolume,
            price: closeValues[closeValues.length - 1]
        };
    }
}

module.exports = StrategyManager;