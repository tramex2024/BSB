// server/src/services/CentralAnalyzer.js

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
            MOMENTUM_THRESHOLD: 0.8 
        };
        this.isLooping = false;
        this.lastPrice = 0;
    }

    async init(io) {
        this.io = io;
        if (!this.isLooping) {
            this.isLooping = true;
            this.run();
        }
    }

    updatePrice(price) {
        this.lastPrice = price;
    }

    async run() {
        console.log("🧠 [CENTRAL-ANALYZER] Ciclo de alta precisión iniciado.");
        
        while (this.isLooping) {
            try {
                let price = this.lastPrice;
                if (price === 0) {
                    const ticker = await bitmartService.getTicker(this.symbol);
                    price = parseFloat(ticker.last_price);
                }

                // Pedimos 100 velas para tener suficiente margen para indicadores largos
                const rawCandles = await bitmartService.getKlines(this.symbol, '1', 100); 
                
                const candles = rawCandles.map(c => ({
                    high: parseFloat(c.high),
                    low: parseFloat(c.low),
                    close: parseFloat(c.close)
                })).slice(0, -1); 

                const closes = candles.map(c => c.close);
                const highs = candles.map(c => c.high);
                const lows = candles.map(c => c.low);
                
                // 1. CÁLCULO DE INDICADORES
                const rsi14Arr = RSI.calculate({ values: [...closes, price], period: this.config.RSI_14 });
                const rsi21Arr = RSI.calculate({ values: [...closes, price], period: this.config.RSI_21 });
                
                const adxArr = ADX.calculate({
                    high: highs,
                    low: lows,
                    close: closes,
                    period: this.config.ADX_PERIOD
                });

                const stochArr = Stochastic.calculate({
                    high: highs,
                    low: lows,
                    close: closes,
                    period: this.config.STOCH_PERIOD,
                    signalPeriod: 3
                });

                // 2. EXTRACCIÓN DE VALORES ACTUALES
                const curRSI14 = rsi14Arr[rsi14Arr.length - 1];
                const curRSI21 = rsi21Arr[rsi21Arr.length - 1];
                const prevRSI21 = rsi21Arr[rsi21Arr.length - 2];
                const curADX = adxArr[adxArr.length - 1]?.adx || 0;
                const curStoch = stochArr[stochArr.length - 1] || { k: 50, d: 50 };

                const signal = this._getSignal(curRSI21, prevRSI21);

                // 3. PERSISTENCIA TOTAL EN MONGODB
                await MarketSignal.findOneAndUpdate(
                    { symbol: this.symbol },
                    {
                        currentPrice: price,
                        currentRSI: curRSI21, // Mantenemos por compatibilidad
                        prevRSI: prevRSI21,
                        rsi14: curRSI14,
                        rsi21: curRSI21,
                        adx: curADX,
                        stochK: curStoch.k,
                        stochD: curStoch.d,
                        signal: signal.action,
                        reason: signal.reason,
                        history: candles.slice(-50),
                        lastUpdate: new Date()
                    },
                    { upsert: true }
                );

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

            } catch (err) {
                console.error(`❌ [CENTRAL-ANALYZER] Error: ${err.message}`);
                if (err.message.includes('429')) await new Promise(r => setTimeout(r, 30000));
            }
            
            await new Promise(r => setTimeout(r, 15000));
        }
    }

    _getSignal(current, prev) {
        const diff = current - prev;
        if (prev <= 30 && current > 30) return { action: "BUY", reason: "Cruce 30 al alza" };
        if (prev < 32 && diff >= this.config.MOMENTUM_THRESHOLD) return { action: "BUY", reason: "Fuerza RSI" };
        if (prev >= 70 && current < 70) return { action: "SELL", reason: "Cruce 70 a la baja" };
        return { action: "HOLD", reason: "Estable" };
    }
}

module.exports = new CentralAnalyzer();