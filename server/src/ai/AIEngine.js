/**
 * Archivo: server/src/ai/AIEngine.js
 * Núcleo de Inteligencia Artificial - Modo Virtual (Sincronizado 2026)
 */

const Aibot = require('../../models/Aibot');
const AIBotOrder = require('../../models/AIBotOrder');
const MarketSignal = require('../../models/MarketSignal'); 
const StrategyManager = require('./StrategyManager');

class AIEngine {
    constructor() {
        this.isRunning = false;
        this.io = null;
        this.history = [];
        this.virtualBalance = 100.00;
        this.lastEntryPrice = 0;
        this.highestPrice = 0;

        // PARÁMETROS DE GESTIÓN
        this.TRAILING_PERCENT = 0.005; // 0.5%
        this.MIN_PROFIT_TO_TIGHTEN = 0.002; 
        this.RISK_PER_TRADE = 0.10;    
        this.EXCHANGE_FEE = 0.001;     
    }

    setIo(io) { 
        this.io = io; 
        this.init(); 
    }

    async init() {
        try {
            let state = await Aibot.findOne({});
            if (!state) state = await Aibot.create({ virtualBalance: 10000.00 }); // Balance inicial recomendado

            this.isRunning = state.isRunning;
            this.virtualBalance = state.virtualBalance || 10000.00;
            this.lastEntryPrice = state.lastEntryPrice || 0;
            this.highestPrice = state.highestPrice || 0;

            const marketData = await MarketSignal.findOne({ symbol: 'BTC_USDT' });
            if (marketData && marketData.history) {
                this.history = marketData.history;
            }

            this._log(this.isRunning ? "🚀 Núcleo IA Online" : "💤 Núcleo en Standby", 0.5);
            this._broadcastStatus(); // Emitir estado inicial al cargar
        } catch (e) {
            console.error("Error en init de AIEngine:", e);
        }
    }

    async toggle(action) {
        this.isRunning = (action === 'start');
        
        if (this.isRunning) {
            const marketData = await MarketSignal.findOne({ symbol: 'BTC_USDT' });
            if (marketData) this.history = marketData.history || [];
        } else {
            this.lastEntryPrice = 0;
            this.highestPrice = 0;
        }
        
        await Aibot.updateOne({}, { 
            isRunning: this.isRunning, 
            lastEntryPrice: this.lastEntryPrice,
            highestPrice: this.highestPrice
        });

        this._broadcastStatus();
        this._log(this.isRunning ? "🚀 NÚCLEO IA: ONLINE" : "🛑 NÚCLEO IA: OFFLINE", this.isRunning ? 1 : 0);
        return { isRunning: this.isRunning, virtualBalance: this.virtualBalance };
    }

    async analyze(price) {
        if (!this.isRunning) return;

        // 1. GESTIÓN DE SALIDA (Trailing Stop)
        if (this.lastEntryPrice > 0) {
            if (price > this.highestPrice) this.highestPrice = price;

            const stopPrice = this.highestPrice * (1 - this.TRAILING_PERCENT);

            if (price <= stopPrice) {
                await this._trade('SELL', price, 0.95);
                return; 
            }
        }

        // 2. OBTENER SEÑALES
        const marketData = await MarketSignal.findOne({ symbol: 'BTC_USDT' }).lean();
        if (marketData && marketData.history) {
            this.history = marketData.history;
            await this._executeStrategy(price);
        }
    }

    async _executeStrategy(price) {
        if (this.history.length < 30) {
            this._log(`Sincronizando mercado... (${this.history.length}/30)`, 0.2, true);
            this._broadcastStatus(); // Enviar progreso de velas (1/30)
            return;
        }

        const analysis = StrategyManager.calculate(this.history);
        if (!analysis || analysis.confidence === undefined) return;

        const { rsi, adx, confidence } = analysis;
        
        if (this.lastEntryPrice === 0) {
            if (confidence >= 0.85) {
                await this._trade('BUY', price, confidence);
            } else if (Math.random() > 0.95) { 
                const msg = `RSI:${rsi.toFixed(1)} | ADX:${adx.toFixed(1)} | Conf:${(confidence*100).toFixed(0)}%`;
                this._log(msg, confidence);
            }
        } else {
            // Posición abierta: Actualizar UI con el profit latente si fuera necesario
            if (Math.random() > 0.9) this._broadcastStatus(); 
        }
    }

    async _trade(side, price, confidence) {
        try {
            const amountInUSDT = this.virtualBalance * this.RISK_PER_TRADE;
            const fee = amountInUSDT * this.EXCHANGE_FEE;
            
            if (side === 'BUY') {
                this.lastEntryPrice = price;
                this.highestPrice = price;
                this.virtualBalance -= fee;
            } else {
                const profitPct = (price - this.lastEntryPrice) / this.lastEntryPrice;
                const profitAmount = (amountInUSDT * profitPct) - (fee * 2);
                this.virtualBalance += profitAmount;
                this.lastEntryPrice = 0;
                this.highestPrice = 0;
            }

            // Persistencia en DB
            await AIBotOrder.create({
                side, price, amount: amountInUSDT,
                isVirtual: true, confidenceScore: Math.round(confidence * 100),
                timestamp: new Date()
            });

            await Aibot.updateOne({}, { 
                virtualBalance: this.virtualBalance,
                lastEntryPrice: this.lastEntryPrice,
                highestPrice: this.highestPrice,
                lastUpdate: new Date()
            });

            // Notificar ejecución de orden para el Toast y Sonido
            if (this.io) {
                this.io.emit('ai-order-executed', { side, price, balance: this.virtualBalance });
            }

            this._broadcastStatus();
        } catch (error) {
            console.error("Error en _trade AI:", error);
        }
    }

    _log(msg, conf, isAnalyzing = false) {
        if (this.io) {
            this.io.emit('ai-decision-update', { confidence: conf, message: msg, isAnalyzing });
        }
    }

    /**
     * ✅ UNIFICADO: Emite el evento que Dashboard y AI Bot esperan
     */
    _broadcastStatus() {
        if (this.io) {
            const data = {
                isRunning: this.isRunning,
                virtualBalance: this.virtualBalance,
                historyCount: this.history.length,
                lastEntryPrice: this.lastEntryPrice
            };
            // Emitimos con el nombre estándar para que todos los módulos se sincronicen
            this.io.emit('ai-status-update', data);
        }
    }
}

const engine = new AIEngine();
module.exports = engine;