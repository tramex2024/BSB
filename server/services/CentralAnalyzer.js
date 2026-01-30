// server/src/services/CentralAnalyzer.js

const { RSI } = require('technicalindicators');
const bitmartService = require('./bitmartService'); // Ajusta la ruta según tu estructura
const MarketSignal = require('../models/MarketSignal');

class CentralAnalyzer {
    constructor() {
        this.io = null;
        this.symbol = 'BTC_USDT';
        this.config = { RSI_14: 14, RSI_21: 21, MOMENTUM_THRESHOLD: 0.8 };
        this.isLooping = false;
    }

    async init(io) {
        this.io = io;
        if (!this.isLooping) {
            this.isLooping = true;
            this.run();
        }
    }

    async run() {
        console.log("🧠 [CENTRAL-ANALYZER] Ciclo de inteligencia iniciado.");
        
        while (this.isLooping) {
            try {
                // 1. Obtener precio y velas frescas
                const ticker = await bitmartService.getTicker(this.symbol);
                const price = parseFloat(ticker.last_price);
                const rawCandles = await bitmartService.getKlines(this.symbol, '1', 60); 
                
                const candles = rawCandles.map(c => ({
                    time: c.timestamp,
                    open: parseFloat(c.open),
                    high: parseFloat(c.high),
                    low: parseFloat(c.low),
                    close: parseFloat(c.close)
                })).slice(0, -1); // Estabilidad: quitamos la vela en formación

                // 2. Cálculos de RSI
                const closes = candles.map(c => c.close);
                const rsi14Arr = RSI.calculate({ values: [...closes, price], period: this.config.RSI_14 });
                const rsi21Arr = RSI.calculate({ values: [...closes, price], period: this.config.RSI_21 });

                const currentRSI14 = rsi14Arr[rsi14Arr.length - 1];
                const currentRSI21 = rsi21Arr[rsi21Arr.length - 1];
                const prevRSI21 = rsi21Arr[rsi21Arr.length - 2];

                // 3. Lógica de Señal (Tu lógica original de momentum)
                const signal = this._getSignal(currentRSI21, prevRSI21);

                // 4. Guardar en DB y Emitir
                await MarketSignal.findOneAndUpdate(
                    { symbol: this.symbol },
                    {
                        currentPrice: price,
                        currentRSI: currentRSI21,
                        prevRSI: prevRSI21,
                        rsi14: currentRSI14,
                        signal: signal.action,
                        reason: signal.reason,
                        history: candles.slice(-50),
                        lastUpdate: new Date()
                    },
                    { upsert: true }
                );

                if (this.io) {
                    this.io.emit('market-signal-update', { 
                        price, rsi14: currentRSI14, rsi21: currentRSI21, signal: signal.action 
                    });
                }

            } catch (err) {
                console.error("❌ [CENTRAL-ANALYZER] Error:", err.message);
            }
            // Latido de 5 segundos para no saturar la API
            await new Promise(r => setTimeout(r, 15000));
        }
    }

    _getSignal(current, prev) {
        const diff = current - prev;
        if (prev <= 30 && current > 30) return { action: "BUY", reason: "Cruce 30 al alza" };
        if (prev < 32 && diff >= this.config.MOMENTUM_THRESHOLD && current > prev) return { action: "BUY", reason: "Rebote Momentum" };
        if (prev >= 70 && current < 70) return { action: "SELL", reason: "Cruce 70 a la baja" };
        if (prev > 68 && Math.abs(diff) >= this.config.MOMENTUM_THRESHOLD && current < prev) return { action: "SELL", reason: "Caída Momentum" };
        return { action: "HOLD", reason: "Estable" };
    }
}

module.exports = new CentralAnalyzer();