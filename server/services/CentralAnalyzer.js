/**
 * BSB/server/services/CentralAnalyzer.js
 * Motor de Indicadores Técnicos Globales con Suavizado de Señal (Smoothing)
 */

const { RSI, ADX, Stochastic, MACD } = require('technicalindicators');
const bitmartService = require('./bitmartService'); 
const MarketSignal = require('../models/MarketSignal');
const AIEngine = require('../src/ai/AIEngine');
const AutoBot = require('../models/Autobot');
const StrategyManager = require('../src/ai/StrategyManager'); // Importado para el cálculo de confianza

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
        
        // --- SISTEMA DE SUAVIZADO (Smoothing) ---
        this.confidenceHistory = []; // Memoria de lecturas de confianza
        this.SMOOTHING_WINDOW = 5;    // Promedia las últimas 5 lecturas
    }

    async init(io) {
        this.io = io;
//        console.log("🧠 [CENTRAL-ANALYZER] Motor reactivo con Smoothing y Fuzzy Logic activo.");
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
                    volume: parseFloat(c.volume || 0),
                    history: [] // Espacio para el array de velas que necesita el StrategyManager
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

            // 2. CÁLCULO DE INDICADORES (Sincronización para DB)
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
            const curRSI21 = rsi21Arr.length > 0 ? parseFloat(rsi21Arr[rsi21Arr.length - 1].toFixed(2)) : 0;
            const prevRSI21 = rsi21Arr.length > 1 ? parseFloat(rsi21Arr[rsi21Arr.length - 2].toFixed(2)) : curRSI21;
            const curADX = adxArr.length > 0 ? parseFloat(adxArr[adxArr.length - 1].adx.toFixed(2)) : 0;
            const curMACD = macdArr.length > 0 ? macdArr[macdArr.length - 1] : { MACD: 0, signal: 0, histogram: 0 };

            const price = this.lastPrice || closes[closes.length - 1];
            const signal = this._getSignal(curRSI21, prevRSI21, curADX, curMACD, price);

            // 3. CÁLCULO DE CONFIANZA IA CON SUAVIZADO
            const analysis = StrategyManager.calculate(candles);
            let finalConfidence = 0;

            if (analysis) {
                // Agregar al historial para promediar
                this.confidenceHistory.push(analysis.confidence);
                if (this.confidenceHistory.length > this.SMOOTHING_WINDOW) {
                    this.confidenceHistory.shift();
                }
                // Calcular promedio ponderado (Smoothing)
                const sum = this.confidenceHistory.reduce((a, b) => a + b, 0);
                finalConfidence = parseFloat((sum / this.confidenceHistory.length).toFixed(4));
            }

            // 4. PERSISTENCIA EN DB
            const updatedSignal = await MarketSignal.findOneAndUpdate(
                { symbol: this.symbol },
                {
                    currentPrice: price,
                    rsi14: curRSI14,
                    rsi21: curRSI21,
                    currentRSI: curRSI14,
                    prevRSI: prevRSI21,
                    adx: curADX,
                    macdValue: parseFloat(curMACD.MACD.toFixed(2)),
                    macdSignal: parseFloat(curMACD.signal.toFixed(2)),
                    macdHist: parseFloat(curMACD.histogram.toFixed(2)),
                    signal: signal.action, 
                    reason: signal.reason,
                    history: candles, // Guardamos el historial para que AIEngine lo encuentre
                    aiConfidence: finalConfidence, // <--- GUARDAMOS LA IA AQUÍ
                    lastUpdate: new Date()
                },
                { upsert: true, new: true }
            );

            // 5. BROADCAST GLOBAL
            if (this.io) {
                this.io.emit('market-signal-update', { 
                    price, 
                    rsi14: curRSI14, 
                    macd: curMACD.histogram,
                    signal: signal.action 
                });
            }

            // 6. DISPARAR IA PARA USUARIOS ACTIVOS
            try {
                const activeAiBots = await AutoBot.find({ aistate: 'RUNNING' });
                
                for (const bot of activeAiBots) {
                    // 🟢 CAMBIO CLAVE: Enviamos un objeto 'brain' con la confianza ya calculada
                    const brain = {
                        confidence: finalConfidence,
                        signal: signal.action,
                        reason: signal.reason
                    };
                    // Ahora AIEngine recibirá la decisión ya tomada
                    await AIEngine.analyze(price, bot.userId, bot, brain);
                    
//                    console.log(`🧠 [IA-DEBUG] Usuario: ${bot.userId} | Confianza Suavizada: ${finalConfidence}`);

                    if (this.io) {
                        this.io.to(bot.userId.toString()).emit('ai-decision-update', { 
                            confidence: finalConfidence, 
                            message: analysis ? analysis.message : "Scanning...",
                            isAnalyzing: true
                        });
                    }
                }
            } catch (aiErr) {
                console.error(`❌ [CENTRAL-ANALYZER] Error disparando IA: ${aiErr.message}`);
            }

            return updatedSignal;

        } catch (err) {
            console.error(`❌ [CENTRAL-ANALYZER] Error: ${err.message}`);
            console.error(err.stack);
        }
    }

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