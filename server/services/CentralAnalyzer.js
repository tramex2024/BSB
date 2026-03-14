/**
 * BSB/server/services/CentralAnalyzer.js
 * Motor de Indicadores Técnicos Globales (Versión MACD + RSI Fix)
 */

const { RSI, ADX, Stochastic, MACD } = require('technicalindicators');
const bitmartService = require('./bitmartService'); 
const MarketSignal = require('../models/MarketSignal');
const AIEngine = require('../src/ai/AIEngine');
const AutoBot = require('../models/Autobot');

class CentralAnalyzer {
    constructor() {
        this.io = null;
        this.symbol = 'BTC_USDT';
        this.config = { 
            RSI_14: 14, 
            RSI_21: 21, 
            ADX_PERIOD: 14, 
            STOCH_PERIOD: 14,
            MACD_FAST: 12,
            MACD_SLOW: 26,
            MACD_SIGNAL: 9,
            MOMENTUM_THRESHOLD: 0.8,
            MAX_HISTORY: 250
        };
        this.lastPrice = 0;
    }

    async init(io) {
        this.io = io;
        console.log("🧠 [CENTRAL-ANALYZER] Motor reactivo con MACD y RSI sincronizado.");
        await this.analyze();
    }

    updatePrice(price) {
        this.lastPrice = parseFloat(price);
    }

    async analyze(externalCandles = null) {
        try {
            let candles = externalCandles;

            // 1. OBTENCIÓN DE DATOS
            if (!candles || candles.length === 0) {
                const raw = await bitmartService.getKlines(this.symbol, '1', 300);
                if (!raw || raw.length === 0) return;

                if (raw[0].timestamp > raw[raw.length - 1].timestamp) {
                    raw.reverse();
                }

                candles = raw.map(c => ({
                    timestamp: String(c.timestamp).length === 10 ? c.timestamp * 1000 : c.timestamp,
                    high: parseFloat(c.high),
                    low: parseFloat(c.low),
                    open: parseFloat(c.open || c.close),
                    close: parseFloat(c.close),
                    volume: parseFloat(c.volume || 0)
                }));
            }

            if (candles.length > this.config.MAX_HISTORY) {
                candles = candles.slice(-this.config.MAX_HISTORY);
            }

            const closes = candles.map(c => c.close);
            const highs = candles.map(c => c.high);
            const lows = candles.map(c => c.low);

            const currentCloses = [...closes];
            if (this.lastPrice && this.lastPrice !== currentCloses[currentCloses.length - 1]) {
                currentCloses.push(this.lastPrice);
            }

            // 2. CÁLCULO DE INDICADORES
            const rsi14Arr = RSI.calculate({ values: currentCloses, period: this.config.RSI_14 });
            const rsi21Arr = RSI.calculate({ values: currentCloses, period: this.config.RSI_21 });
            
            const adxArr = ADX.calculate({
                high: highs, low: lows, close: closes,
                period: this.config.ADX_PERIOD
            });

            const stochArr = Stochastic.calculate({
                high: highs, low: lows, close: closes,
                period: this.config.STOCH_PERIOD,
                signalPeriod: 3
            });

            const macdArr = MACD.calculate({
                values: currentCloses,
                fastPeriod: this.config.MACD_FAST,
                slowPeriod: this.config.MACD_SLOW,
                signalPeriod: this.config.MACD_SIGNAL,
                SimpleMAOscillator: false,
                SimpleMASignal: false
            });

            const curRSI14 = rsi14Arr.length > 0 ? parseFloat(rsi14Arr[rsi14Arr.length - 1].toFixed(2)) : 0;
            const curRSI21 = rsi21Arr.length > 0 ? parseFloat(rsi21Arr[rsi21Arr.length - 1].toFixed(2)) : 0;
            const prevRSI21 = rsi21Arr.length > 1 ? parseFloat(rsi21Arr[rsi21Arr.length - 2].toFixed(2)) : curRSI21;
            
            const curADX = adxArr.length > 0 ? parseFloat(adxArr[adxArr.length - 1].adx.toFixed(2)) : 0;
            const curStoch = stochArr.length > 0 ? stochArr[stochArr.length - 1] : { k: 0, d: 0 };
            const curMACD = macdArr.length > 0 ? macdArr[macdArr.length - 1] : { MACD: 0, signal: 0, histogram: 0 };

            // 4. LÓGICA DE SEÑAL
            const price = this.lastPrice || closes[closes.length - 1];
            const signal = this._getSignal(curRSI21, prevRSI21, curADX, curMACD, price);

            // 5. PERSISTENCIA EN DB
            const updatedSignal = await MarketSignal.findOneAndUpdate(
                { symbol: this.symbol },
                {
                    currentPrice: price,
                    rsi14: curRSI14,
                    rsi21: curRSI21,
                    currentRSI: curRSI14,
                    prevRSI: prevRSI21,
                    adx: curADX,
                    stochK: curStoch.k,
                    stochD: curStoch.d,
                    macdValue: parseFloat(curMACD.MACD.toFixed(2)),
                    macdSignal: parseFloat(curMACD.signal.toFixed(2)),
                    macdHist: parseFloat(curMACD.histogram.toFixed(2)),
                    signal: signal.action, 
                    reason: signal.reason,
                    lastUpdate: new Date()
                },
                { upsert: true, new: true }
            );

            // 6. BROADCAST GLOBAL
            if (this.io) {
                this.io.emit('market-signal-update', { 
                    price, 
                    rsi14: curRSI14, 
                    macd: curMACD.histogram,
                    signal: signal.action 
                });
            }

            // 7. DISPARAR IA PARA USUARIOS ACTIVOS (Fixing Syntax here)
            try {
                const activeAiBots = await AutoBot.find({ aistate: 'RUNNING' });
                
                for (const bot of activeAiBots) {
                    const result = await AIEngine.analyze(price, bot.userId, bot);
                    const conf = result ? result.confidence : 0;
                    
                    console.log(`🧠 [IA-DEBUG] Usuario: ${bot.userId} | Confianza: ${conf}`);

                    if (this.io) {
                        this.io.to(bot.userId).emit('bot-log', { 
                            message: `👁️ Neural Flow: Confianza calculada en ${(conf * 100).toFixed(2)}%`, 
                            type: 'info' 
                        });
                    }
                }
            } catch (aiErr) {
                console.error(`❌ [CENTRAL-ANALYZER] Error disparando IA: ${aiErr.message}`);
            }

            return updatedSignal;

        } catch (err) {
            console.error(`❌ [CENTRAL-ANALYZER] Error: ${err.message}`);
        }
    } // <--- Esta es la llave que faltaba cerrando analyze()

    _getSignal(rsi, prevRsi, adx, macd, price) {
        if (!rsi || !macd) return { action: "HOLD", reason: "Data Loading" };

        const rsiDiff = rsi - prevRsi;
        const macdBullish = macd.MACD > macd.signal;
        const macdBearish = macd.MACD < macd.signal;

        if (rsi <= 35 && rsiDiff > 0 && !macdBearish) {
            return { action: "BUY", reason: "RSI Oversold + MACD Neutral/Bullish" };
        }

        if (rsi >= 65 && (rsiDiff < 0 || macdBearish)) {
            return { action: "SELL", reason: "RSI Overbought + MACD Bearish Cross" };
        }

        if (rsiDiff > this.config.MOMENTUM_THRESHOLD && macdBullish) {
            return { action: "BUY", reason: "Strong Momentum Bullish" };
        }

        return { action: "HOLD", reason: "Market Stable" };
    }
}

module.exports = new CentralAnalyzer();