// server/workers/MarketWorker.js

const bitmartService = require('../services/bitmartService');
const MarketSignal = require('../models/MarketSignal');
const aiEngine = require('../src/ai/AIEngine'); // Conexión directa

class MarketWorker {
    constructor() {
        this.symbol = 'BTC_USDT';
        this.interval = 2000; // 2 segundos
        this.timer = null;
    }

    async start() {
        console.log('📡 [MarketWorker]: Centralizando flujo de datos públicos...');
        this.run();
    }

    async run() {
        try {
            // 1. Única llamada a la API externa
            const rawCandles = await bitmartService.getKlines(this.symbol, '1', 100);
            
            if (!rawCandles || rawCandles.length === 0) {
                throw new Error("No se obtuvieron datos de Bitmart");
            }

            const lastPrice = parseFloat(rawCandles[rawCandles.length - 1].close);

            // 2. Actualizar persistencia para nuevos usuarios o reinicios
            await MarketSignal.findOneAndUpdate(
                { symbol: this.symbol },
                { 
                    currentPrice: lastPrice,
                    history: rawCandles,
                    lastUpdate: new Date()
                },
                { upsert: true }
            );

            // 3. DIFUSIÓN PÚBLICA: Todos los usuarios ven el mismo precio
            if (global.io) {
                global.io.emit('market-update', {
                    symbol: this.symbol,
                    price: lastPrice
                });
            }

            // 4. INYECCIÓN A LA IA: El Worker "despierta" a la IA con datos frescos
            if (aiEngine.isRunning) {
                // Pasamos las velas directamente para que la IA no haga findOne()
                aiEngine.analyze(lastPrice, rawCandles);
            }

        } catch (error) {
            console.error('❌ [MarketWorker] Error:', error.message);
        } finally {
            this.timer = setTimeout(() => this.run(), this.interval);
        }
    }
}

module.exports = new MarketWorker();