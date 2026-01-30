const { ADX, StochasticRSI, EMA } = require('technicalindicators');

class StrategyManager {
    /**
     * Calcula la estrategia basada en indicadores técnicos
     * @param {Array} history - Velas de 1m (OHLC)
     */
    static calculate(history) {
        // Necesitamos al menos 30 velas para que el ADX y Stoch sean estables
        if (!history || history.length < 30) return null;

        const closeValues = history.map(c => c.close);
        const highValues = history.map(c => c.high);
        const lowValues = history.map(c => c.low);
        
        // 1. ADX (Fuerza de tendencia) - Periodo 14
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
        const prevStoch = stochResult[stochResult.length - 2];

        // 3. EMAs (Dirección de tendencia)
        const ema9 = EMA.calculate({ period: 9, values: closeValues });
        const ema21 = EMA.calculate({ period: 21, values: closeValues });
        
        const lastEma9 = ema9[ema9.length - 1];
        const lastEma21 = ema21[ema21.length - 1];
        const currentPrice = closeValues[closeValues.length - 1];

        const isBullish = lastEma9 > lastEma21;

        // --- SISTEMA DE PUNTUACIÓN DE CONFIANZA (OPTIMIZADO) ---
        let score = 0;
        let totalWeight = 100;

        // Criterio 1: Estructura de Tendencia (40%)
        // Puntuamos si la tendencia es alcista Y el precio está por encima de la media rápida
        if (isBullish) {
            score += 25; 
            if (currentPrice > lastEma9) score += 15;
        }

        // Criterio 2: Momentum y Giro (35%)
        // No solo buscamos sobreventa, buscamos que el K esté subiendo (Confirmación)
        if (latestStoch && prevStoch) {
            if (latestStoch.k < 20 && latestStoch.k > prevStoch.k) {
                // Sobreventa con giro al alza (Señal fuerte)
                score += 35;
            } else if (latestStoch.k < 50 && latestStoch.k > prevStoch.k) {
                // Zona neutral con impulso alcista
                score += 20;
            } else if (latestStoch.k > 80) {
                // Sobrecompra: reducimos score para evitar comprar en el techo
                score -= 20;
            }
        }

        // Criterio 3: Fuerza del Movimiento (25%)
        if (latestADX) {
            if (latestADX.adx > 25) {
                score += 25; // Tendencia muy fuerte
            } else if (latestADX.adx > 18) {
                score += 15; // Tendencia naciendo
            }
        }

        // Normalizamos la confianza entre 0 y 1
        const confidence = Math.max(0, score / totalWeight);

        return {
            rsi: latestStoch ? latestStoch.k : 50,
            adx: latestADX ? latestADX.adx : 0,
            trend: isBullish ? 'bullish' : 'bearish',
            confidence: confidence,
            price: currentPrice,
            ema9: lastEma9,
            ema21: lastEma21
        };
    }
}

module.exports = StrategyManager;