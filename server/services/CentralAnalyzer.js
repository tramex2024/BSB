/**
 * BSB/server/services/CentralAnalyzer.js
 * Global Technical Indicators Motor with Latch State Machine
 */

const { RSI, ADX, Stochastic, MACD } = require('technicalindicators');
const bitmartService = require('./bitmartService'); 
const MarketSignal = require('../models/MarketSignal');
const AIEngine = require('../src/states/ai/AIEngine');
const AutoBot = require('../models/Autobot');
const StrategyManager = require('../src/managers/StrategyManager');

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
        
        // --- LIVE MEMORY ---
        this.lastLiveRsi = null;

        // --- STATE MACHINE FLAGS (LATCH SYSTEM) ---
        this.isArmedLong = false;
        this.isArmedShort = false;

        // --- PULSE SYSTEM ---
        this.activePulseSignal = 'HOLD';
        this.activePulseReason = 'Market Stable';
        this.pulseExpirationTime = 0;
        
        // --- SMOOTHING SYSTEM ---
        this.confidenceHistory = [];  
        this.SMOOTHING_WINDOW = 5;    

        // --- 🛡️ SHIELD SYSTEMS ---
        this.isAnalyzing = false;        
        this.lastAnalysisTime = 0;      
        this.EXECUTION_INTERVAL = 1000; 
    }

    async init(io) {
        this.io = io;
        await this.analyze();
    }

    updatePrice(price) {
        this.lastPrice = parseFloat(price);
    }

    async analyze(externalCandles = null) {
        if (this.isAnalyzing) return;

        const now = Date.now();
        if (now - this.lastAnalysisTime < this.EXECUTION_INTERVAL) return;

        try {
            this.isAnalyzing = true; 
            let candles = externalCandles;

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
            
            // 🧠 Evaluamos con lógica de estado
            const signal = this._getSignal(curRSI14, curADX, curMACD, price);

            this.lastLiveRsi = curRSI14;

            // 3. AI CONFIDENCE
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

            const currentTime = Date.now();
            
            if (signal.action !== 'HOLD') {
                this.activePulseSignal = signal.action;
                this.activePulseReason = signal.reason;
                this.pulseExpirationTime = currentTime + 5000;
            }

            let actionToPersist = signal.action;
            let reasonToPersist = 'Market Stable';

            const AI_ENABLED = process.env.AI_ENABLED === 'true';
            if (!AI_ENABLED && ['AIBUY', 'AISELL'].includes(actionToPersist)) {
                actionToPersist = 'HOLD';
                reasonToPersist = "AI Signals Disabled by Config";
            }

            if (currentTime < this.pulseExpirationTime) {
                actionToPersist = this.activePulseSignal;
                reasonToPersist = this.activePulseReason;
            } else {
                this.activePulseSignal = 'HOLD';
            }

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
                    signal: actionToPersist,
                    reason: reasonToPersist,
                    history: candles,
                    aiConfidence: finalConfidence,
                    lastUpdate: new Date()
                },
                { upsert: true, new: true }
            );

            if (this.io) {
                this.io.emit('market-signal-update', { price, rsi14: curRSI14, macd: curMACD.histogram, signal: actionToPersist });
            }

            this.lastAnalysisTime = Date.now();
            return updatedSignal;

        } catch (err) {
            console.error(`❌ [CENTRAL-ANALYZER] Critical Error: ${err.message}`);
        } finally {
            this.isAnalyzing = false;
        }
    }

    /**
     * DYNAMIC TECHNICAL EVALUATION: LATCH SYSTEM
     */
    _getSignal(rsi, adx, macd, price) {
        if (!rsi || !macd) return { action: "HOLD", reason: "Data Loading" };

        // 1. LATCH ACTIVATION (Armado)
        if (rsi <= 30) this.isArmedLong = true;
        if (rsi >= 70) this.isArmedShort = true;

        // 2. LATCH TRIGGER (Disparo)
        
        // Disparo LONG: RSI >= 33 y estábamos armados
        if (this.isArmedLong && rsi >= 33) {
            this.isArmedLong = false; // Reset inmediato
            return { 
                action: "BUY", 
                reason: `RSI Latch Triggered: Recovered from <30 to ${rsi}` 
            };
        }

        // Disparo SHORT: RSI <= 67 y estábamos armados
        if (this.isArmedShort && rsi <= 67) {
            this.isArmedShort = false; // Reset inmediato
            return { 
                action: "SELL", 
                reason: `RSI Latch Triggered: Cooled from >70 to ${rsi}` 
            };
        }

        return { action: "HOLD", reason: "Monitoring Latch..." };
    }
}

module.exports = new CentralAnalyzer();