/**
 * BSB/server/services/CentralAnalyzer.js
 * Global Technical Indicators Motor with Signal Smoothing
 */

const { RSI, ADX, Stochastic, MACD } = require('technicalindicators');
const bitmartService = require('./bitmartService'); 
const MarketSignal = require('../models/MarketSignal');
const AIEngine = require('../src/states/ai/AIEngine');
const AutoBot = require('../models/Autobot');
const StrategyManager = require('../src/managers/StrategyManager'); // Imported for confidence calculations

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
            MAX_HISTORY: 500
        };
        this.lastPrice = 0;
        
        // --- SMOOTHING SYSTEM ---
        this.confidenceHistory = []; // Memory array for confidence readings
        this.SMOOTHING_WINDOW = 5;    // Averages the last 5 readings
    }

    async init(io) {
        this.io = io;
        await this.analyze();
    }

    updatePrice(price) {
        this.lastPrice = parseFloat(price);
    }

    async analyze(externalCandles = null) {
        try {
            let candles = externalCandles;

            // 1. DATA ACQUISITION
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
                    volume: parseFloat(c.volume || 0),
                    history: [] 
                }));
            }

            if (candles.length > this.config.MAX_HISTORY) {
                candles = candles.slice(-this.config.MAX_HISTORY);
            }

            const closes = candles.map(c => c.close);
            const highs = candles.map(c => c.high);
            const lows = candles.map(c => c.low);

            const currentCloses = [...closes];

            if (this.lastPrice) {
                if (currentCloses.length >= this.config.MAX_HISTORY) {
                    currentCloses.shift(); 
                }
                currentCloses.push(this.lastPrice); 
            }

            // 2. INDICATOR CALCULATIONS (DB Synchronization)
            const rsi14Arr = RSI.calculate({ values: currentCloses, period: this.config.RSI_14 });
            const rsi21Arr = RSI.calculate({ values: currentCloses, period: this.config.RSI_21 });
            const adxArr = ADX.calculate({ high: highs, low: lows, close: closes, period: this.config.ADX_PERIOD });
            const macdArr = MACD.calculate({
                values: currentCloses,
                fastPeriod: this.config.MACD_FAST,
                slowPeriod: this.config.MACD_SLOW,
                signalPeriod: this.config.MACD_SIGNAL,
                SimpleMAOscillator: false, SimpleMASignal: false
            });

            const curRSI14 = rsi14Arr.length > 0 ? parseFloat(rsi14Arr[rsi14Arr.length - 1].toFixed(2)) : 0;
            const prevRSI14 = rsi14Arr.length > 1 ? parseFloat(rsi14Arr[rsi14Arr.length - 2].toFixed(2)) : curRSI14;
            const curRSI21 = rsi21Arr.length > 0 ? parseFloat(rsi21Arr[rsi21Arr.length - 1].toFixed(2)) : 0;
            const curADX = adxArr.length > 0 ? parseFloat(adxArr[adxArr.length - 1].adx.toFixed(2)) : 0;
            const curMACD = macdArr.length > 0 ? macdArr[macdArr.length - 1] : { MACD: 0, signal: 0, histogram: 0 };

            const price = this.lastPrice || closes[closes.length - 1];
            
            // Evaluate signals using the high reactivity model
            const signal = this._getSignal(curRSI14, prevRSI14, curADX, curMACD, price);

            // 3. AI CONFIDENCE CALCULATION WITH SMOOTHING
            const analysis = StrategyManager.calculate(candles);
            let finalConfidence = 0;

            if (analysis) {
                this.confidenceHistory.push(analysis.confidence);
                if (this.confidenceHistory.length > this.SMOOTHING_WINDOW) {
                    this.confidenceHistory.shift();
                }
                const sum = this.confidenceHistory.reduce((a, b) => a + b, 0);
                finalConfidence = parseFloat((sum / this.confidenceHistory.length).toFixed(4));
            }

            // 4. DATABASE PERSISTENCE
            const updatedSignal = await MarketSignal.findOneAndUpdate(
                { symbol: this.symbol },
                {
                    currentPrice: price,
                    rsi14: curRSI14,
                    rsi21: curRSI21,
                    currentRSI: curRSI14,
                    prevRSI: prevRSI14,
                    adx: curADX,
                    macdValue: parseFloat(curMACD.MACD.toFixed(2)),
                    macdSignal: parseFloat(curMACD.signal.toFixed(2)),
                    macdHist: parseFloat(curMACD.histogram.toFixed(2)),
                    signal: signal.action, 
                    reason: signal.reason,
                    history: candles,
                    aiConfidence: finalConfidence,
                    lastUpdate: new Date()
                },
                { upsert: true, new: true }
            );

            // 5. GLOBAL BROADCAST
            if (this.io) {
                this.io.emit('market-signal-update', { 
                    price, 
                    rsi14: curRSI14, 
                    macd: curMACD.histogram,
                    signal: signal.action 
                });
            }

            // 6. TRIGGER AI BOT CHECKS FOR ACTIVE RUNNING INSTANCES
            try {
                const activeAiBots = await AutoBot.find({ aistate: 'RUNNING' });
                
                for (const bot of activeAiBots) {
                    const brain = {
                        confidence: finalConfidence,
                        signal: signal.action,
                        reason: signal.reason
                    };
                    await AIEngine.analyze(price, bot.userId, bot, brain);

                    if (this.io) {
                        this.io.to(bot.userId.toString()).emit('ai-decision-update', { 
                            confidence: finalConfidence, 
                            message: analysis ? analysis.message : "Scanning...",
                            isAnalyzing: true
                        });
                    }
                }
            } catch (aiErr) {
                console.error(`❌ [CENTRAL-ANALYZER] Error executing AIEngine: ${aiErr.message}`);
            }

            return updatedSignal;

        } catch (err) {
            console.error(`❌ [CENTRAL-ANALYZER] Critical Error: ${err.message}`);
            console.error(err.stack);
        }
    }

    /**
     * DYNAMIC TECHNICAL EVALUATION BY FRONTIER CROSSINGS
     * Uses a memory trigger mechanism: Requires RSI to have visited overbought/oversold 
     * areas before confirming the directional reversal, preventing false entry on momentum extension.
     */
    _getSignal(rsi, prevRsi, adx, macd, price) {
        if (!rsi || !prevRsi || !macd) return { action: "HOLD", reason: "Data Loading" };
        
        const rsiDiff = rsi - prevRsi;
        const macdBullish = macd.MACD > macd.signal;
        const macdBearish = macd.MACD < macd.signal;

        // --- TRADING BOUNDARIES ---
        const ZONA_SOBRECOMPRA = 70;
        const RETORNO_SHORT = 67;
        
        const ZONA_SOBREVENTA = 30;
        const RETORNO_LONG = 33;

        // 1. 🟢 TRADITIONAL SELL CONDITION (SHORT) - DIRECTIONAL MEMORY
        const rsiDroppingFromTop = prevRsi >= ZONA_SOBRECOMPRA && rsi < ZONA_SOBRECOMPRA;
        const rsiCoolingInsideWindow = prevRsi >= RETORNO_SHORT && rsi < RETORNO_SHORT && prevRsi <= ZONA_SOBRECOMPRA;

        if ((rsiDroppingFromTop || rsiCoolingInsideWindow) && macdBearish) {
            return { 
                action: "SELL", 
                reason: `RSI confirmed reversal from overbought top | Current RSI: ${rsi} (Prev: ${prevRsi}) | MACD Bearish` 
            };
        }

        // 2. 🟢 TRADITIONAL BUY CONDITION (LONG) - DIRECTIONAL MEMORY
        const rsiBouncingFromBottom = prevRsi <= ZONA_SOBREVENTA && rsi > ZONA_SOBREVENTA;
        const rsiRecoveringInsideWindow = prevRsi <= RETORNO_LONG && rsi > RETORNO_LONG && prevRsi >= ZONA_SOBREVENTA;

        if ((rsiBouncingFromBottom || rsiRecoveringInsideWindow) && macdBullish) {
            return { 
                action: "BUY", 
                reason: `RSI confirmed reversal from oversold bottom | Current RSI: ${rsi} (Prev: ${prevRsi}) | MACD Bullish` 
            };
        }

        // 3. 🧠 BULLISH MOMENTUM CONDITION (AI BOT ONLY)
        if (rsiDiff > this.config.MOMENTUM_THRESHOLD && rsi > 50 && macdBullish) {
            return { action: "AIBUY", reason: "Strong Momentum Bullish Breakout (AI Target)" };
        }

        // 4. 🧠 BEARISH MOMENTUM CONDITION (AI BOT ONLY)
        if (rsiDiff < -this.config.MOMENTUM_THRESHOLD && rsi < 50 && macdBearish) {
            return { action: "AISELL", reason: "Strong Momentum Bearish Breakdown (AI Target)" };
        }

        return { action: "HOLD", reason: "Market Stable / RSI Within Safety Ranges" };
    }
}

module.exports = new CentralAnalyzer();