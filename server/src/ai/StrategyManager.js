/**
 * StrategyManager.js - Versión Híbrida Neural-Scoring
 */
const { ADX, StochasticRSI, EMA, BollingerBands } = require('technicalindicators');

class StrategyManager {
    static calculate(history) {
        // Reducimos el requisito a 100 velas para mayor agilidad, 
        // pero validamos las necesarias para cada indicador.
        if (!history || history.length < 100) return null;

        const closeValues = history.map(c => parseFloat(c.close));
        const highValues = history.map(c => parseFloat(c.high));
        const lowValues = history.map(c => parseFloat(c.low));
        const currentPrice = closeValues[closeValues.length - 1];
        
        try {
            let score = 0;
            let triggers = [];

            // --- 1. DETECCIÓN DE SOBREVENTA EXTREMA (COMPRAR LA CAÍDA) ---
            const bb = BollingerBands.calculate({ period: 20, values: closeValues, stdDev: 2 });
            if (bb.length > 0) {
                const lastBB = bb[bb.length - 1];
                // Si el precio perfora la banda inferior (Panic Sell detectado)
                if (currentPrice <= lastBB.lower) {
                    score += 45; 
                    triggers.push("Volatility Dip");
                }
            }

            // --- 2. OSCILADOR (MOMENTO) ---
            const stoch = StochasticRSI.calculate({
                values: closeValues, rsiPeriod: 14, stochasticPeriod: 14, kPeriod: 3, dPeriod: 3
            });
            if (stoch.length >= 2) {
                const lastK = stoch[stoch.length - 1].k;
                const prevK = stoch[stoch.length - 2].k;
                
                if (lastK < 20) {
                    score += 25; // Punto por estar en zona de compra
                    if (lastK > prevK) {
                        score += 15; // Extra por giro alcista
                        triggers.push("Stoch Recovery");
                    }
                } else if (lastK > 85) {
                    score -= 50; // Bloqueo total por sobrecompra
                }
            }

            // --- 3. TENDENCIA INSTITUCIONAL (FILTRO DINÁMICO) ---
            const ema200Arr = EMA.calculate({ period: 100, values: closeValues }); // Bajamos a 100 para más reactividad
            const lastEma = ema200Arr.length > 0 ? ema200Arr[ema200Arr.length - 1] : currentPrice;
            
            if (currentPrice > lastEma) {
                score += 20; // Bonus por tendencia a favor
                triggers.push("Trend Support");
            } else {
                // En lugar de castigar con -30, solo sumamos 5 si hay señales de rebote
                if (score > 40) score += 5; 
            }

            // --- 4. FUERZA DEL MOVIMIENTO (ADX) ---
            const adxRes = ADX.calculate({ high: highValues, low: lowValues, close: closeValues, period: 14 });
            const lastADX = adxRes.length > 0 ? adxRes[adxRes.length - 1].adx : 0;
            
            if (lastADX > 20) score += 10; // Hay fuerza

            // Normalización final (0.0 a 1.0)
            const confidence = Math.max(0, Math.min(1, score / 100));

            return {
                confidence,
                price: currentPrice,
                trend: currentPrice > lastEma ? 'Bullish' : 'Bearish/Rebound',
                adx: lastADX,
                message: triggers.length > 0 ? `Signal: ${triggers.join(' + ')}` : "Scanning Market..."
            };

        } catch (e) {
            console.error("❌ Strategy Error:", e);
            return null;
        }
    }
}

module.exports = StrategyManager;