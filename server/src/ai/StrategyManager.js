//server/src/ai/StrategyManager.js

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

        // Lógica de cruces y posición
        const isBullishCross = lastEma9 > lastEma21;
        const isAboveLongTerm = currentPrice > lastEma50;

        // --- SISTEMA DE PUNTUACIÓN ---
        let score = 0;

        // Criterio 1: Estructura EMA
        if (isAboveLongTerm) {
            score += 30; 
            if (isBullishCross) score += 20; 
        } else {
            score -= 25; 
        }

        // Criterio 2: Momentum Stochastic RSI
        if (latestStoch && prevStoch) {
            const kDiff = latestStoch.k - prevStoch.k;
            
            if (latestStoch.k < 20 && kDiff > 2) {
                score += 35; // Rebote en sobreventa
            } else if (latestStoch.k < 50 && kDiff > 5) {
                score += 15; // Impulso alcista
            } else if (latestStoch.k > 85) {
                score -= 45; // Sobrecompra (Peligro)
            }
        }

        // Criterio 3: Filtro de Volatilidad ADX
        if (latestADX > 22) {
            score += 15; 
        } else if (latestADX < 15) {
            score -= 30; // Mercado muy lateral
        }

        // Normalización (0.0 a 1.0)
        const confidence = Math.max(0, Math.min(1, score / 100));

        return {
            rsiK: latestStoch ? latestStoch.k : 50,
            rsiD: latestStoch ? latestStoch.d : 50,
            adx: latestADX,
            trend: isAboveLongTerm ? 'bullish' : 'bearish',
            confidence: confidence,
            price: currentPrice,
            message: this._generateMessage(isAboveLongTerm, latestADX, latestStoch, confidence)
        };
    }

    static _generateMessage(bullish, adx, stoch, conf) {
        if (conf >= 0.85) return "🚀 ALTA CONFIANZA: Patrón Neural Detectado.";
        if (stoch && stoch.k > 80) return "⚠️ MOMENTUM AGOTADO: Riesgo de corrección.";
        if (adx < 18) return "😴 RANGO LATERAL: Sin fuerza en la tendencia.";
        if (!bullish) return "📉 FILTRO EMA: Bajo la media de 50 periodos.";
        if (conf > 0.6) return "⚖️ SEÑAL DÉBIL: Esperando mayor volumen.";
        return "🔍 ESCANEANDO: Buscando ineficiencias...";
    }
}

module.exports = StrategyManager;