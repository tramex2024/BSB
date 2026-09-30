/**
 * BSB/server/src/managers/StrategyManager.js
 * Score de régimen + confirmación (no es un modelo ML).
 * Devuelve signal, confidence y features para MarketContext / AIEngine.
 */
const {
    ADX,
    ATR,
    BollingerBands,
    EMA,
    MACD,
    RSI,
    StochasticRSI,
} = require('technicalindicators');

class StrategyManager {
    static calculate(history) {
        if (!history || history.length < 100) return null;

        const closeValues = history.map((c) => parseFloat(c.close));
        const highValues = history.map((c) => parseFloat(c.high));
        const lowValues = history.map((c) => parseFloat(c.low));
        const currentPrice = closeValues[closeValues.length - 1];

        try {
            const rsiArr = RSI.calculate({ period: 14, values: closeValues });
            const rsi21Arr = RSI.calculate({ period: 21, values: closeValues });
            const rsi14 = rsiArr.length ? rsiArr[rsiArr.length - 1] : 50;
            const rsi21 = rsi21Arr.length ? rsi21Arr[rsi21Arr.length - 1] : 50;
            const prevRSI = rsiArr.length > 1 ? rsiArr[rsiArr.length - 2] : rsi14;

            const bb = BollingerBands.calculate({
                period: 20,
                values: closeValues,
                stdDev: 2,
            });
            const lastBB = bb.length ? bb[bb.length - 1] : null;

            const stoch = StochasticRSI.calculate({
                values: closeValues,
                rsiPeriod: 14,
                stochasticPeriod: 14,
                kPeriod: 3,
                dPeriod: 3,
            });
            const lastStoch = stoch.length ? stoch[stoch.length - 1] : { k: 50, d: 50 };
            const prevStoch = stoch.length > 1 ? stoch[stoch.length - 2] : lastStoch;
            const stochK = lastStoch.k ?? 50;
            const stochD = lastStoch.d ?? 50;

            const ema100 = EMA.calculate({ period: 100, values: closeValues });
            const lastEma = ema100.length ? ema100[ema100.length - 1] : currentPrice;
            const prevEma = ema100.length > 1 ? ema100[ema100.length - 2] : lastEma;
            const emaRising = lastEma >= prevEma;

            const adxRes = ADX.calculate({
                high: highValues,
                low: lowValues,
                close: closeValues,
                period: 14,
            });
            const lastADX = adxRes.length ? adxRes[adxRes.length - 1].adx : 0;

            const macdRes = MACD.calculate({
                values: closeValues,
                fastPeriod: 12,
                slowPeriod: 26,
                signalPeriod: 9,
                SimpleMAOscillator: false,
                SimpleMASignal: false,
            });
            const lastMacd = macdRes.length
                ? macdRes[macdRes.length - 1]
                : { MACD: 0, signal: 0, histogram: 0 };
            const prevMacd = macdRes.length > 1 ? macdRes[macdRes.length - 2] : lastMacd;
            const macdValue = lastMacd.MACD || 0;
            const macdSignal = lastMacd.signal || 0;
            const macdHist = lastMacd.histogram || 0;
            const macdHistUp = macdHist > (prevMacd.histogram || 0);

            const atrArr = ATR.calculate({
                high: highValues,
                low: lowValues,
                close: closeValues,
                period: 14,
            });
            const atr = atrArr.length ? atrArr[atrArr.length - 1] : 0;

            const ranging = lastADX < 18;
            const trending = lastADX >= 22;
            const aboveEma = currentPrice > lastEma;
            const triggers = [];
            let score = 50;

            if (aboveEma && emaRising) {
                score += 12;
                triggers.push('EMA100 up');
            } else if (!aboveEma && !emaRising) {
                score -= 16;
                triggers.push('EMA100 down');
            }

            if (macdHist > 0 && macdHistUp) {
                score += 12;
                triggers.push('MACD rising');
            } else if (macdHist < 0 && !macdHistUp) {
                score -= 14;
                triggers.push('MACD falling');
            }

            if (trending && aboveEma) score += 8;
            if (trending && !aboveEma) score -= 10;
            if (ranging) score -= 4;

            if (lastBB) {
                const width = lastBB.upper - lastBB.lower || 1;
                const pos = (currentPrice - lastBB.lower) / width;
                if (ranging && currentPrice <= lastBB.lower) {
                    score += 14;
                    triggers.push('BB oversold range');
                } else if (ranging && pos < 0.25 && rsi14 < 40) {
                    score += 8;
                    triggers.push('BB low range');
                } else if (currentPrice < lastBB.middle && !aboveEma && trending) {
                    score -= 12;
                    triggers.push('Below mid in downtrend');
                }
                if (currentPrice >= lastBB.upper && rsi14 > 70) {
                    score -= 14;
                    triggers.push('BB overbought');
                }
            }

            if (stochK < 20 && stochK > prevStoch.k) {
                score += 14;
                triggers.push('Stoch RSI turn up');
            } else if (stochK < 25 && rsi14 < 35) {
                score += 8;
                triggers.push('Stoch RSI oversold');
            } else if (stochK > 80 && stochK < prevStoch.k) {
                score -= 16;
                triggers.push('Stoch RSI turn down');
            } else if (stochK > 85) {
                score -= 10;
            }

            if (rsi14 < 30 && rsi14 > prevRSI) {
                score += 10;
                triggers.push('RSI bounce');
            } else if (rsi14 > 78) {
                score -= 18;
                triggers.push('RSI overbought');
            } else if (rsi14 > 68 && macdHist < 0) {
                score -= 8;
            }

            score = Math.max(0, Math.min(100, score));
            const confidence = parseFloat((score / 100).toFixed(4));

            let signal = 'HOLD';
            if (rsi14 >= 80 || (stochK > 88 && macdHist < 0)) {
                signal = 'STRONG_SELL';
            } else if (score >= 72 && (aboveEma || (ranging && rsi14 < 40))) {
                signal = 'STRONG_BUY';
            } else if (score >= 58 && macdHist >= 0) {
                signal = 'BUY';
            } else if (score <= 22 || (!aboveEma && macdHist < 0 && rsi14 > 55)) {
                signal = 'STRONG_SELL';
            } else if (score <= 38) {
                signal = 'SELL';
            }

            let reason = 'Market Stable';
            if (signal === 'STRONG_BUY' || signal === 'BUY') {
                reason = triggers.join(' + ') || 'Bullish setup';
            } else if (signal === 'STRONG_SELL' || signal === 'SELL') {
                reason = triggers.join(' + ') || 'Bearish setup';
            } else if (ranging) {
                reason = 'Low ADX range';
            }

            return {
                confidence,
                aiConfidence: confidence,
                signal,
                price: currentPrice,
                currentPrice,
                rsi14: parseFloat(rsi14.toFixed(2)),
                rsi21: parseFloat(rsi21.toFixed(2)),
                prevRSI: parseFloat(prevRSI.toFixed(2)),
                currentRSI: parseFloat(rsi14.toFixed(2)),
                adx: parseFloat(lastADX.toFixed(2)),
                atr: parseFloat(atr.toFixed(4)),
                stochK: parseFloat(stochK.toFixed(4)),
                stochD: parseFloat(stochD.toFixed(4)),
                macdValue: parseFloat(macdValue.toFixed(2)),
                macdSignal: parseFloat(macdSignal.toFixed(2)),
                macdHist: parseFloat(macdHist.toFixed(2)),
                ema100: parseFloat(lastEma.toFixed(2)),
                reason,
                message: triggers.length ? triggers.join(' + ') : 'Neutral scan',
            };
        } catch (e) {
            console.error('❌ StrategyManager Error:', e);
            return null;
        }
    }
}

module.exports = StrategyManager;