// server/src/services/CentralAnalyzer.js

const { RSI } = require('technicalindicators');
const bitmartService = require('./bitmartService'); 
const MarketSignal = require('../models/MarketSignal');

class CentralAnalyzer {
    constructor() {
        this.io = null;
        this.symbol = 'BTC_USDT';
        this.config = { RSI_14: 14, RSI_21: 21, MOMENTUM_THRESHOLD: 0.8 };
        this.isLooping = false;
        this.lastPrice = 0; // Almacenaremos el precio del WS
    }

    async init(io) {
        this.io = io;
        if (!this.isLooping) {
            this.isLooping = true;
            this.run();
        }
    }

    // Método para que server.js le pase el precio del WebSocket
    updatePrice(price) {
        this.lastPrice = price;
    }

    async run() {
        console.log("🧠 [CENTRAL-ANALYZER] Ciclo de inteligencia iniciado.");
        
        while (this.isLooping) {
            try {
                // OPTIMIZACIÓN: Solo pedimos velas. 
                // El precio lo tomamos de this.lastPrice (actualizado por el WS en server.js)
                // Si no hay precio aún, usamos una llamada de respaldo solo una vez.
                let price = this.lastPrice;
                
                if (price === 0) {
                    const ticker = await bitmartService.getTicker(this.symbol);
                    price = parseFloat(ticker.last_price);
                }

                // Llamada a Klines (Velas)
                const rawCandles = await bitmartService.getKlines(this.symbol, '1', 60); 
                
                const candles = rawCandles.map(c => ({
                    time: c.timestamp,
                    open: parseFloat(c.open),
                    high: parseFloat(c.high),
                    low: parseFloat(c.low),
                    close: parseFloat(c.close)
                })).slice(0, -1); 

                const closes = candles.map(c => c.close);
                
                // Cálculos
                const rsi14Arr = RSI.calculate({ values: [...closes, price], period: this.config.RSI_14 });
                const rsi21Arr = RSI.calculate({ values: [...closes, price], period: this.config.RSI_21 });

                const currentRSI14 = rsi14Arr[rsi14Arr.length - 1];
                const currentRSI21 = rsi21Arr[rsi21Arr.length - 1];
                const prevRSI21 = rsi21Arr[rsi21Arr.length - 2];

                const signal = this._getSignal(currentRSI21, prevRSI21);

                // Guardar y Emitir
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
                // Si falla por 429, el siguiente ciclo esperará más
                console.error(`❌ [CENTRAL-ANALYZER] Error: ${err.message}`);
                if (err.message.includes('429')) {
                    await new Promise(r => setTimeout(r, 30000)); // Espera 30s si hay baneo temporal
                }
            }
            
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