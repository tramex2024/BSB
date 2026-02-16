/**
 * BSB/server/services/CentralAnalyzer.js
 * Motor de Indicadores Técnicos Globales (Optimizado para BSB 2026)
 */

const { RSI, ADX, Stochastic } = require('technicalindicators');
const bitmartService = require('./bitmartService'); 
const MarketSignal = require('../models/MarketSignal');

class CentralAnalyzer {
    constructor() {
        this.io = null;
        this.symbol = 'BTC_USDT';
        this.config = { 
            RSI_14: 14, 
            RSI_21: 21, 
            ADX_PERIOD: 14, 
            STOCH_PERIOD: 14,
            MOMENTUM_THRESHOLD: 0.8,
            MAX_HISTORY: 250 // Límite máximo de velas en DB
        };
        this.lastPrice = 0;
    }

    async init(io) {
        this.io = io;
        console.log("🧠 [CENTRAL-ANALYZER] Motor reactivo inicializado.");
        // Ejecución inmediata al arrancar
        await this.analyze();
    }

    updatePrice(price) {
        this.lastPrice = price;
    }

    async analyze(externalCandles = null) {
        try {
            let candles = externalCandles;

            // 1. OBTENCIÓN DE DATOS
            if (!candles) {
                const raw = await bitmartService.getKlines(this.symbol, '1', 300);
                candles = raw.map(c => ({
                    // UNIFICACIÓN DE TIMESTAMP: Forzamos milisegundos para consistencia en DB
                    timestamp: String(c.timestamp).length === 10 ? c.timestamp * 1000 : c.timestamp,
                    high: parseFloat(c.high),
                    low: parseFloat(c.low),
                    open: parseFloat(c.open || c.close),
                    close: parseFloat(c.close),
                    volume: parseFloat(c.volume || 0)
                }));
            }

            if (!candles || candles.length === 0) return;

            // --- CONTROL DE CRECIMIENTO ---
            if (candles.length > this.config.MAX_HISTORY) {
                candles = candles.slice(-this.config.MAX_HISTORY);
            }

            const closes = candles.map(c => c.close);
            const highs = candles.map(c => c.high);
            const lows = candles.map(c => c.low);
            const price = this.lastPrice || closes[closes.length - 1];

            // 2. CÁLCULO DE INDICADORES
            const rsi14Arr = RSI.calculate({ values: [...closes.slice(0, -1), price], period: this.config.RSI_14 });
            const rsi21Arr = RSI.calculate({ values: [...closes.slice(0, -1), price], period: this.config.RSI_21 });
            
            const adxArr = ADX.calculate({
                high: highs, low: lows, close: closes,
                period: this.config.ADX_PERIOD
            });

            const stochArr = Stochastic.calculate({
                high: highs, low: lows, close: closes,
                period: this.config.STOCH_PERIOD,
                signalPeriod: 3
            });

            const curRSI14 = rsi14Arr[rsi14Arr.length - 1];
            const curRSI21 = rsi21Arr[rsi21Arr.length - 1];
            const prevRSI21 = rsi21Arr[rsi21Arr.length - 2];
            const curADX = adxArr[adxArr.length - 1]?.adx || 0;
            const curStoch = stochArr[stochArr.length - 1] || { k: 50, d: 50 };

            const signal = this._getSignal(curRSI21, prevRSI21);

            // 3. PERSISTENCIA EN MONGODB
            const updatedSignal = await MarketSignal.findOneAndUpdate(
                { symbol: this.symbol },
                {
                    currentPrice: price,
                    rsi14: curRSI14,
                    rsi21: curRSI21,
                    adx: curADX,
                    stochK: curStoch.k,
                    stochD: curStoch.d,
                    signal: signal.action, // SIEMPRE será uno de los del ENUM
                    reason: signal.reason,
                    currentRSI: curRSI14, 
                    prevRSI: prevRSI21 || curRSI21,
                    lastUpdate: new Date(),
                    history: candles // El array ahora fluirá hasta 250
                },
                { upsert: true, new: true, runValidators: true }
            );

            // 4. NOTIFICACIÓN GLOBAL
            if (this.io) {
                this.io.emit('market-signal-update', { 
                    price, 
                    rsi14: curRSI14, 
                    rsi21: curRSI21, 
                    adx: curADX, 
                    stochK: curStoch.k,
                    signal: signal.action 
                });
            }

            return updatedSignal;

        } catch (err) {
            console.error(`❌ [CENTRAL-ANALYZER] Error: ${err.message}`);
        }
    }

    _getSignal(current, prev) {
        const diff = current - prev;
        // Lógica unificada para usar HOLD
        if (prev <= 30 && current > 30) return { action: "BUY", reason: "Cruce 30 al alza" };
        if (prev < 32 && diff >= this.config.MOMENTUM_THRESHOLD) return { action: "BUY", reason: "Fuerza RSI" };
        if (prev >= 70 && current < 70) return { action: "SELL", reason: "Cruce 70 a la baja" };
        
        return { action: "HOLD", reason: "Estable" }; 
    }
}

module.exports = new CentralAnalyzer();