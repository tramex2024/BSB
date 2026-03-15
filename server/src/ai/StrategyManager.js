/**
 * StrategyManager.js - Versión Híbrida con Graduación Proporcional (Fuzzy Logic)
 */
const { ADX, StochasticRSI, EMA, BollingerBands } = require('technicalindicators');

class StrategyManager {
    static calculate(history) {
        // Mantenemos el requisito de 100 velas para consistencia
        if (!history || history.length < 100) return null;

        const closeValues = history.map(c => parseFloat(c.close));
        const highValues = history.map(c => parseFloat(c.high));
        const lowValues = history.map(c => parseFloat(c.low));
        const currentPrice = closeValues[closeValues.length - 1];
        
        try {
            let score = 0;
            let triggers = [];

            // --- 1. BOLLINGER (SUAVIZADO: 45 Pts Máx) ---
            // Evalúa qué tan cerca está el precio de la banda inferior.
            const bb = BollingerBands.calculate({ period: 20, values: closeValues, stdDev: 2 });
            if (bb.length > 0) {
                const lastBB = bb[bb.length - 1];
                
                if (currentPrice < lastBB.middle) {
                    const range = lastBB.middle - lastBB.lower;
                    const position = lastBB.middle - currentPrice;
                    
                    // Si el precio baja de la media, el score sube gradualmente hasta 45
                    const bbScore = Math.min(45, (position / range) * 45);
                    score += bbScore;
                    
                    if (bbScore > 20) triggers.push("Volatility Pressure");
                }
            }

            // --- 2. STOCHASTIC RSI (SUAVIZADO: 40 Pts Máx) ---
            // Evalúa el momentum sin saltos bruscos.
            const stoch = StochasticRSI.calculate({
                values: closeValues, rsiPeriod: 14, stochasticPeriod: 14, kPeriod: 3, dPeriod: 3
            });
            if (stoch.length >= 2) {
                const lastK = stoch[stoch.length - 1].k;
                const prevK = stoch[stoch.length - 2].k;
                
                // Zona de interés: debajo de 50 (neutro-bajo)
                if (lastK < 50) {
                    // Puntos por nivel: entre más cerca de 0, más puntos (máx 25)
                    const levelPoints = ((50 - lastK) / 50) * 25;
                    score += levelPoints;

                    // Puntos por giro alcista: evalúa la fuerza del rebote (máx 15)
                    if (lastK > prevK) {
                        const change = lastK - prevK;
                        // Si el rebote es de 5 puntos o más, da el máximo de 15 pts
                        const recoveryPoints = Math.min(15, (change / 5) * 15);
                        score += recoveryPoints;
                        triggers.push("Momentum Pivot");
                    }
                } else if (lastK > 80) {
                    // Penalización suave por sobrecompra: resta hasta 60 pts si llega a 100
                    const penalty = ((lastK - 80) / 20) * 60;
                    score -= penalty;
                }
            }

            // --- 3. TENDENCIA INSTITUCIONAL (SUAVIZADO: 10 Pts Máx) ---
            // Usa la EMA 100 como soporte magnético.
            const ema100Arr = EMA.calculate({ period: 100, values: closeValues });
            const lastEma = ema100Arr.length > 0 ? ema100Arr[ema100Arr.length - 1] : currentPrice;
            
            if (currentPrice > lastEma) {
                // Distancia porcentual a la EMA
                const distancePct = (currentPrice - lastEma) / lastEma;
                // Si está un 1% por encima, obtiene los 10 puntos completos
                const trendScore = Math.min(10, (distancePct / 0.01) * 10);
                score += trendScore;
                if (trendScore > 5) triggers.push("Bullish Support");
            }

            // --- 4. FUERZA DE TENDENCIA (ADX) (SUAVIZADO: 5 Pts Máx) ---
            const adxRes = ADX.calculate({ high: highValues, low: lowValues, close: closeValues, period: 14 });
            const lastADX = adxRes.length > 0 ? adxRes[adxRes.length - 1].adx : 0;
            
            if (lastADX > 15) {
                // Sube de 0 a 5 puntos conforme el ADX sube de 15 a 30
                const adxScore = Math.min(5, ((lastADX - 15) / 15) * 5);
                score += adxScore;
            }

            // Normalización final (0.0 a 1.0)
            const confidence = Math.max(0, Math.min(1, score / 100));

            return {
                confidence: parseFloat(confidence.toFixed(4)),
                price: currentPrice,
                trend: currentPrice > lastEma ? 'Bullish' : 'Bearish/Rebound',
                adx: parseFloat(lastADX.toFixed(2)),
                message: triggers.length > 0 ? `Signals: ${triggers.join(' + ')}` : "Neural Scan in progress..."
            };

        } catch (e) {
            console.error("❌ StrategyManager Error:", e);
            return null;
        }
    }
}

module.exports = StrategyManager;