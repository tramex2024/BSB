/**
 * BSB/server/src/au/engines/StrategyManager.js
 * Motor Analítico: Sistema de Confluencia Multivariable.
 * Versión Blindada: Manejo de errores de longitud y normalización de indicadores.
 */
const { ADX, StochasticRSI, EMA } = require('technicalindicators');

class StrategyManager {
    static calculate(history) {
        // 🟢 AUDITORÍA: Requisito de 250 velas para garantizar que la EMA 200 sea precisa.
        if (!history || history.length < 250) return null;

        const closeValues = history.map(c => parseFloat(c.close));
        const highValues = history.map(c => parseFloat(c.high));
        const lowValues = history.map(c => parseFloat(c.low));
        
        try {
            // 1. CÁLCULO DE INDICADORES
            const adxResult = ADX.calculate({ high: highValues, low: lowValues, close: closeValues, period: 14 });
            const latestADX = adxResult.length > 0 ? adxResult[adxResult.length - 1].adx : 0;

            const stochResult = StochasticRSI.calculate({
                values: closeValues, rsiPeriod: 14, stochasticPeriod: 14, kPeriod: 3, dPeriod: 3
            });
            
            if (stochResult.length < 2) return null; 
            const latestStoch = stochResult[stochResult.length - 1];
            const prevStoch = stochResult[stochResult.length - 2];

            // 🟢 AUDITORÍA: Verificación de longitud para EMAs antes de acceder al último índice
            const ema9 = EMA.calculate({ period: 9, values: closeValues });
            const ema21 = EMA.calculate({ period: 21, values: closeValues });
            const ema200 = EMA.calculate({ period: 200, values: closeValues });
            
            if (ema9.length === 0 || ema21.length === 0 || ema200.length === 0) return null;

            const lastEma9 = ema9[ema9.length - 1];
            const lastEma21 = ema21[ema21.length - 1];
            const lastEma200 = ema200[ema200.length - 1];
            const currentPrice = closeValues[closeValues.length - 1];

            // 2. SISTEMA DE SCORING (Puntuación de Confianza)
            const isBullishCross = lastEma9 > lastEma21;
            const isAboveInstitutional = currentPrice > lastEma200;

            let score = 0;
            
            // Filtro Macro (Tendencia Principal)
            if (isAboveInstitutional) {
                score += 30; 
                if (isBullishCross) score += 10;
            } else {
                score -= 30; // Penalización por tendencia bajista
            }

            // Oscilador (Momento de entrada)
            if (latestStoch && prevStoch) {
                const kDiff = latestStoch.k - prevStoch.k;
                // Sobrevendido con giro alcista (Gatillo principal)
                if (latestStoch.k < 25 && kDiff > 3) score += 40;
                // Sobrecomprado (Zona de no-entrada)
                else if (latestStoch.k > 80) score -= 50;
                // Momentum alcista general
                else if (kDiff > 5) score += 15;
            }

            // Volatilidad y Fuerza (ADX)
            if (latestADX > 25) score += 20; 
            else if (latestADX < 18) score -= 40; // Evitar mercados laterales "picahielo"

            // 3. NORMALIZACIÓN DE RESULTADOS (0.0 a 1.0)
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
            console.error("❌ AI Math Error:", e);
            return null;
        }
    }

    /**
     * Traduce los datos técnicos a lenguaje humano para el Dashboard.
     */
    static _generateMessage(bullish, adx, stoch, conf) {
        if (conf >= 0.75) return "🚀 ALTA CONFIANZA: Alineación técnica detectada.";
        if (stoch && stoch.k > 80) return "⚠️ AGOTAMIENTO: Sobrecompra detectada.";
        if (adx < 18) return "😴 BAJO VOLUMEN: Mercado sin dirección clara.";
        if (!bullish) return "📉 FILTRO MACRO: Tendencia bajista dominante.";
        return "🔍 ESCANEANDO: Buscando punto de entrada óptimo...";
    }
}

module.exports = StrategyManager;