// server/workers/MarketWorker.js

const bitmartService = require('../services/bitmartService');
const MarketSignal = require('../models/MarketSignal');
// Asegúrate de que estas rutas sean correctas según tu carpeta
const aiEngine = require('../src/ai/AIEngine'); 
const autobotLogic = require('../autobotLogic'); // <-- IMPORTANTE RE-INCLUIRLO

class MarketWorker {
    constructor() {
        this.symbol = 'BTC_USDT';
        this.interval = 2000; 
        this.timer = null;
    }

    async start() {
        console.log('📡 [MarketWorker]: Centralizando flujo de datos públicos...');
        this.run();
    }

    async run() {
        try {
            const rawCandles = await bitmartService.getKlines(this.symbol, '1', 100);
            
            if (!rawCandles || rawCandles.length === 0) {
                throw new Error("No se obtuvieron datos de Bitmart");
            }

            const lastPrice = parseFloat(rawCandles[rawCandles.length - 1].close);

            // 1. Persistencia
            await MarketSignal.findOneAndUpdate(
                { symbol: this.symbol },
                { 
                    currentPrice: lastPrice,
                    history: rawCandles,
                    lastUpdate: new Date()
                },
                { upsert: true }
            );

            // 2. Emisión para el Dashboard (Público)
            if (global.io) {
                // Enviamos 'market-update' para la IA
                global.io.emit('market-update', { symbol: this.symbol, price: lastPrice });
                
                // Mantenemos 'marketData' para no romper tu Frontend actual
                global.io.emit('marketData', { 
                    price: lastPrice, 
                    exchangeOnline: true 
                });
            }

            // 3. Ejecución de IA Virtual
            if (aiEngine.isRunning) {
                aiEngine.analyze(lastPrice, rawCandles);
            }

            // 4. EJECUCIÓN DE BOT REAL (Lo que faltaba)
            // El bot real también necesita el ciclo para revisar sus órdenes abiertas
            await autobotLogic.botCycle(lastPrice);

        } catch (error) {
            console.error('❌ [MarketWorker] Error:', error.message);
        } finally {
            this.timer = setTimeout(() => this.run(), this.interval);
        }
    }
}

module.exports = new MarketWorker();