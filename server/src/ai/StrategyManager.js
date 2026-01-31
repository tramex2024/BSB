const { ADX, StochasticRSI, EMA } = require('technicalindicators');

class StrategyManager {
    /**
     * Calcula la estrategia basada en indicadores técnicos
     * @param {Array} history - Velas de 1m (OHLC)
     */
    static calculate(history) {
        // Aumentamos el requisito a 50 velas para tener una EMA 50 estable
        if (!history || history.length < 50) return null;

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

        // 2. Stochastic RSI (Momentum con mayor exigencia)
        const stochResult = StochasticRSI.calculate({
            values: closeValues,
            rsiPeriod: 14,
            stochasticPeriod: 14,
            kPeriod: 3,
            dPeriod: 3
        });
        const latestStoch = stochResult[stochResult.length - 1];
        const prevStoch = stochResult[stochResult.length - 2];

        // 3. EMAs - Tres capas de confirmación
        const ema9 = EMA.calculate({ period: 9, values: closeValues });
        const ema21 = EMA.calculate({ period: 21, values: closeValues });
        const ema50 = EMA.calculate({ period: 50, values: closeValues });
        
        const lastEma9 = ema9[ema9.length - 1];
        const lastEma21 = ema21[ema21.length - 1];
        const lastEma50 = ema50[ema50.length - 1];
        const currentPrice = closeValues[closeValues.length - 1];

        // Tendencia de corto plazo (Cruce) y largo plazo (EMA 50)
        const isBullishCross = lastEma9 > lastEma21;
        const isAboveLongTerm = currentPrice > lastEma50;

        // --- SISTEMA DE PUNTUACIÓN DE CONFIANZA (SÚPER SELECTIVO) ---
        let score = 0;
        let totalWeight = 100;

        // Criterio 1: Estructura y Tendencia Mayor (50%)
        // Si el precio está bajo la EMA 50, el riesgo de "trampa para toros" es muy alto.
        if (isAboveLongTerm) {
            score += 30; // Tendencia mayor a favor
            if (isBullishCross) score += 20; // Cruce de corto plazo confirmado
        } else {
            // Penalizamos fuertemente si estamos en tendencia bajista mayor
            score -= 10;
        }

        // Criterio 2: Momentum de Giro Real (30%)
        if (latestStoch && prevStoch) {
            // Buscamos que K no solo suba, sino que cruce con fuerza desde abajo
            const kDiff = latestStoch.k - prevStoch.k;
            
            if (latestStoch.k < 30 && kDiff > 5) {
                score += 30; // Giro potente desde sobreventa
            } else if (latestStoch.k < 50 && kDiff > 2) {
                score += 15; // Recuperación moderada
            } else if (latestStoch.k > 75) {
                score -= 30; // EVITAR comprar en la cima
            }
        }

        // Criterio 3: Fuerza ADX (20%)
        if (latestADX) {
            if (latestADX.adx > 25) score += 20; // Movimiento con fuerza
            else if (latestADX.adx < 15) score -= 10; // Rango lateral (Peligro de señales falsas)
        }

        // Normalizamos la confianza
        const confidence = Math.max(0, score / totalWeight);

        return {
            rsi: latestStoch ? latestStoch.k : 50,
            adx: latestADX ? latestADX.adx : 0,
            trend: isAboveLongTerm ? 'bullish_strong' : 'bearish_weak',
            confidence: confidence,
            price: currentPrice,
            ema9: lastEma9,
            ema21: lastEma21,
            ema50: lastEma50
        };
    }
}

module.exports = StrategyManager;