/**
 * BSB/server/services/CentralAnalyzer.js
 * Global Technical Indicators Motor with Live Intra-Candle Memory
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
        // Guarda el RSI en vivo del último ciclo (segundo a segundo)
        this.lastLiveRsi = null;

        // --- PULSE SYSTEM (TTL 5 SEGUNDOS) ---
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

            // 2. INDICATOR CALCULATIONS
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
            // prevRSI14 es el cierre de la VELA anterior
            const prevRSI14 = rsi14Arr.length > 1 ? parseFloat(rsi14Arr[rsi14Arr.length - 2].toFixed(2)) : curRSI14;
            
            const curRSI21 = rsi21Arr.length > 0 ? parseFloat(rsi21Arr[rsi21Arr.length - 1].toFixed(2)) : 0;
            const curADX = adxArr.length > 0 ? parseFloat(adxArr[adxArr.length - 1].adx.toFixed(2)) : 0;
            const curMACD = macdArr.length > 0 ? macdArr[macdArr.length - 1] : { MACD: 0, signal: 0, histogram: 0 };

            const price = this.lastPrice || closes[closes.length - 1];
            
            // 🧠 Evaluamos la señal pasando TANTO el RSI de la vela anterior COMO el RSI del segundo anterior
            const signal = this._getSignal(curRSI14, prevRSI14, this.lastLiveRsi, curADX, curMACD, price);

            // Actualizamos la memoria para el próximo ciclo de 1 segundo
            this.lastLiveRsi = curRSI14;

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

            // --- SISTEMA DE PULSO (TTL 5 SEGUNDOS EN RAM) ---
            const currentTime = Date.now();
            
            // Si la matemática detecta una acción real, disparamos el pulso y fijamos la expiración
            if (signal.action !== 'HOLD') {
                this.activePulseSignal = signal.action;
                this.activePulseReason = signal.reason;
                this.pulseExpirationTime = currentTime + 5000; // Vive exactamente 5 segundos
            }

            // Determinamos qué señal enviar a los bots
            // En CentralAnalyzer.js, donde calculas la señal:
let actionToPersist = signal.action;

// 🛡️ FILTRO DE SEGURIDAD EXTREMO (Añade esto justo después de calcular signal)
const AI_SIGNALS = ['AIBUY', 'AISELL'];
if (AI_SIGNALS.includes(actionToPersist)) {
    actionToPersist = 'HOLD'; // Forzamos a HOLD si detecta una señal que no queremos
    reasonToPersist = "AI Signals Disabled by User";
}

            // Si el pulso actual sigue vivo, lo mantenemos
            if (currentTime < this.pulseExpirationTime) {
                actionToPersist = this.activePulseSignal;
                reasonToPersist = this.activePulseReason;
            } else {
                // Si ya pasaron los 5 segundos, apagamos el pulso
                this.activePulseSignal = 'HOLD';
            }

            // 4. DATABASE PERSISTENCE (Escritura limpia y directa)
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
                    aiConfidence: finalConfidence
                    // Dejamos que Mongoose maneje 'lastUpdate' automáticamente sin romper el pulso
                },
                { upsert: true, new: true }
            );

            // 5. GLOBAL BROADCAST
            if (this.io) {
                this.io.emit('market-signal-update', { 
                    price, 
                    rsi14: curRSI14, 
                    macd: curMACD.histogram,
                    signal: actionToPersist 
                });
            }

            // 6. TRIGGER AI BOT CHECKS
            try {
                const activeAiBots = await AutoBot.find({ aistate: 'RUNNING' });
                
                for (const bot of activeAiBots) {
                    //const brain = {
                    //    confidence: finalConfidence,
                    //    signal: actionToPersist,
                    //    reason: reasonToPersist
                    //};
                    //await AIEngine.analyze(price, bot.userId, bot, brain);

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

            this.lastAnalysisTime = Date.now();
            return updatedSignal;

        } catch (err) {
            console.error(`❌ [CENTRAL-ANALYZER] Critical Error: ${err.message}`);
        } finally {
            this.isAnalyzing = false;
        }
    }

    /**
     * DYNAMIC TECHNICAL EVALUATION BY FRONTIER CROSSINGS
     */
    _getSignal(rsi, prevCandleRsi, lastLiveRsi, adx, macd, price) {
        if (!rsi || !prevCandleRsi || !macd) return { action: "HOLD", reason: "Data Loading" };
        
        // Momentum de vela entera (histórico)
        const rsiDiff = rsi - prevCandleRsi; 
        
        // Momentum intra-vela (cambio segundo a segundo)
        const liveRsiDiff = lastLiveRsi !== null ? rsi - lastLiveRsi : 0;

        const macdBullish = macd.MACD > macd.signal;
        const macdBearish = macd.MACD < macd.signal;

        const ZONA_SOBRECOMPRA = 70;
        const RETORNO_SHORT = 67;
        
        const ZONA_SOBREVENTA = 30;
        const RETORNO_LONG = 33;

        // 🛡️ EL SECRETO: Usar el último RSI EN VIVO para cazar las caídas que ocurren en la misma vela
        const effectivePrevRsi = lastLiveRsi !== null ? lastLiveRsi : prevCandleRsi;

        // 1. 🔴 TRADITIONAL SELL CONDITION 
        const rsiDroppingFromTop = effectivePrevRsi >= ZONA_SOBRECOMPRA && rsi < ZONA_SOBRECOMPRA;
        const rsiPassedShortThreshold = effectivePrevRsi > RETORNO_SHORT && rsi <= RETORNO_SHORT;

        if (rsiDroppingFromTop || rsiPassedShortThreshold) {
            return { 
                action: "SELL", 
                reason: `RSI confirmed reversal from top | Live RSI dropped from ${effectivePrevRsi} to ${rsi}` 
            };
        }

        // 2. 🟢 TRADITIONAL BUY CONDITION
        const rsiBouncingFromBottom = effectivePrevRsi <= ZONA_SOBREVENTA && rsi > ZONA_SOBREVENTA;
        const rsiPassedLongThreshold = effectivePrevRsi < RETORNO_LONG && rsi >= RETORNO_LONG;

        if (rsiBouncingFromBottom || rsiPassedLongThreshold) {
            return { 
                action: "BUY", 
                reason: `RSI confirmed reversal from bottom | Live RSI rose from ${effectivePrevRsi} to ${rsi}` 
            };
        }

        // 3. 🧠 BULLISH MOMENTUM CONDITION (AI BOT ONLY)
        // Bloqueamos el AIBUY si el RSI está cayendo fuertemente en el segundo actual (liveRsiDiff < -1.5)
        if (rsiDiff > this.config.MOMENTUM_THRESHOLD && rsi > 50 && macdBullish && liveRsiDiff >= -1.5) {
            //return { action: "AIBUY", reason: "Strong Momentum Bullish Breakout (AI Target)" };
        }

        // 4. 🧠 BEARISH MOMENTUM CONDITION (AI BOT ONLY)
        // Bloqueamos el AISELL si el RSI está rebotando fuertemente en el segundo actual
        if (rsiDiff < -this.config.MOMENTUM_THRESHOLD && rsi < 50 && macdBearish && liveRsiDiff <= 1.5) {
            //return { action: "AISELL", reason: "Strong Momentum Bearish Breakdown (AI Target)" };
        }

        return { action: "HOLD", reason: "Market Stable / RSI Within Safety Ranges" };
    }
}

module.exports = new CentralAnalyzer();