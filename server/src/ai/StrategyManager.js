// server/src/ai/StrategyManager.js

const { ADX, StochasticRSI } = require('technicalindicators');

class StrategyManager {
    static calculate(history, period = 14) {
        const input = {
            high: history.map(c => c.high),
            low: history.map(c => c.low),
            close: history.map(c => c.close),
            period: period
        };

        // Calculamos ADX (Fuerza)
        const adxResult = ADX.calculate(input);
        const latestADX = adxResult[adxResult.length - 1];

        // Calculamos StochRSI (Momento - Sobrecompra/Sobreventa)
        const stochInput = {
            values: history.map(c => c.close),
            rsiPeriod: 14,
            stochasticPeriod: 14,
            kPeriod: 3,
            dPeriod: 3
        };
        const stochResult = StochasticRSI.calculate(stochInput);
        const latestStoch = stochResult[stochResult.length - 1];

        return { adx: latestADX, stoch: latestStoch };
    }
}

module.exports = StrategyManager;