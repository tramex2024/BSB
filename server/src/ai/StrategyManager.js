//server/src/ai/StrategyManager.js

const { ADX, StochasticRSI, EMA } = require('technicalindicators');

class StrategyManager {
    static calculate(history) {
        // Validación de seguridad: Necesitamos suficientes velas
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

        // --- Lógica de cruces y tendencia ---
        const isBullishCross = lastEma9 > lastEma21;
        const isAboveLongTerm = currentPrice > lastEma50;

        // --- SISTEMA DE PUNTUACIÓN (Total Max: 100) ---
        let score = 0;

        // Criterio 1: Estructura EMA (50%)
        if (isAboveLongTerm) {
            score += 30; 
            if (isBullishCross) score += 20; 
        } else {
            score -= 30; // Penalización más fuerte si estamos bajo la EMA50
        }

        // Criterio 2: Stochastic RSI (30%) - El "Timing"
        if (latestStoch && prevStoch) {
            const kDiff = latestStoch.k - prevStoch.k;
            
            if (latestStoch.k < 20 && kDiff > 2) {
                score += 30; // Sobreventa extrema con giro alcista
            } else if (latestStoch.k < 50 && kDiff > 1) {
                score += 15; // Zona neutral-baja recuperándose
            } else if (latestStoch.k > 85) {
                score -= 50; // BLOQUEO: No compramos en el techo
            }
        }

        // Criterio 3: Fuerza ADX (20%)
        if (latestADX > 25) {
            score += 20; // Tendencia confirmada
        } else if (latestADX < 18) {
            score -= 20; // Mercado "picado" o lateral, alta probabilidad de fallar
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
        if (conf >= 0.85) return "🚀 SEÑAL ÓPTIMA: Alta probabilidad detectada.";
        if (stoch && stoch.k > 80) return "⚠️ AGUARDANDO: Precio en zona de sobrecompra.";
        if (adx < 20) return "😴 LATERALIZADO: Falta fuerza en el volumen.";
        if (!bullish) return "📉 BAJISTA: No hay soporte en temporalidad mayor.";
        return "⚖️ ESCANEANDO: Buscando confluencia de indicadores...";
    }
}

module.exports = StrategyManager;