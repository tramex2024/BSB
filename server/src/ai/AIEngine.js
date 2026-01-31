/**
 * Archivo: server/src/ai/AIEngine.js
 * Núcleo de Inteligencia Artificial - Modo Virtual (Sincronizado 2026)
 */

// server/src/ai/AIEngine.js
const Aibot = require('../../models/Aibot');
const AIBotOrder = require('../../models/AIBotOrder');
const MarketSignal = require('../../models/MarketSignal'); 
const StrategyManager = require('./StrategyManager');

class AIEngine {
    constructor() {
        this.isRunning = false;
        this.io = null;
        this.history = [];
        this.virtualBalance = 10000.00;
        this.lastEntryPrice = 0;
        this.highestPrice = 0;

        this.TRAILING_PERCENT = 0.005; // 0.5%
        this.RISK_PER_TRADE = 0.10;    // 10%
        this.EXCHANGE_FEE = 0.001;     // 0.1%
    }

    /** Inicializa el motor con el socket y carga el estado previo de DB */
    async init(io) {
        this.io = io;
        try {
            let state = await Aibot.findOne({});
            if (!state) state = await Aibot.create({ virtualBalance: 10000.00 });

            this.isRunning = state.isRunning;
            this.virtualBalance = state.virtualBalance || 10000.00;
            this.lastEntryPrice = state.lastEntryPrice || 0;
            this.highestPrice = state.highestPrice || 0;

            // Carga inicial de historial para calentar indicadores
            const marketData = await MarketSignal.findOne({ symbol: 'BTC_USDT' }).lean();
            if (marketData) this.history = marketData.history || [];

            this._log(this.isRunning ? "🚀 IA Online" : "💤 IA en Standby", 0.5);
            this._broadcastStatus();
        } catch (e) {
            console.error("❌ Error en init AIEngine:", e);
        }
    }

    /** Control externo para arrancar/detener */
    async toggle(action) {
        this.isRunning = (action === 'start');
        
        if (!this.isRunning) {
            this.lastEntryPrice = 0;
            this.highestPrice = 0;
        }

        await Aibot.updateOne({}, { 
            isRunning: this.isRunning, 
            lastEntryPrice: this.lastEntryPrice,
            highestPrice: this.highestPrice
        });

        this._broadcastStatus();
        this._log(this.isRunning ? "🚀 IA: MODO ACTIVO" : "🛑 IA: PAUSADA", this.isRunning ? 1 : 0);
        return { isRunning: this.isRunning, virtualBalance: this.virtualBalance };
    }

    /** Analiza el precio inyectado por el MarketWorker */
    async analyze(price, newHistory = null) {
        if (!this.isRunning) return;

        // Actualizamos nuestro historial interno con los datos del Worker
        if (newHistory) {
            this.history = newHistory;
        }

        // 1. Gestión de Salida: Trailing Stop Dinámico
        if (this.lastEntryPrice > 0) {
            if (price > this.highestPrice) {
                this.highestPrice = price;
                Aibot.updateOne({}, { highestPrice: this.highestPrice }).catch(()=>{});
            }

            const stopPrice = this.highestPrice * (1 - this.TRAILING_PERCENT);
            if (price <= stopPrice) {
                this._log(`🎯 Trailing Stop activado en $${price}`, 0.9);
                await this._trade('SELL', price, 1.0); 
                return; 
            }
        }

        // 2. Ejecución de Estrategia
        await this._executeStrategy(price);
    }

    async _executeStrategy(price) {
        // Requerimos 50 velas para EMA50
        if (this.history.length < 50) {
            this._log(`Sincronizando flujo neural... (${this.history.length}/50)`, 0.2, true);
            this._broadcastStatus();
            return;
        }

        const analysis = StrategyManager.calculate(this.history);
        if (!analysis || analysis.confidence === undefined) return;

        const { confidence, message } = analysis;

        if (this.lastEntryPrice === 0) {
            if (confidence >= 0.85) {
                await this._trade('BUY', price, confidence);
            } else if (Math.random() > 0.98) {
                this._log(message || "Escaneando mercado...", confidence);
            }
        } else {
            // Feedback de posición abierta (cada cierto tiempo)
            if (Math.random() > 0.96) {
                const profit = ((price - this.lastEntryPrice) / this.lastEntryPrice * 100).toFixed(2);
                this._log(`En posición: ${profit}% | Pico: $${this.highestPrice}`, 1);
            }
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
                this._log(`🔥 COMPRA VIRTUAL @ $${price}`, 1);
            } else {
                const profitPct = (price - this.lastEntryPrice) / this.lastEntryPrice;
                const netProfit = (amountInUSDT * profitPct) - (fee * 2);
                this.virtualBalance += netProfit;
                this.lastEntryPrice = 0;
                this.highestPrice = 0;
                this._log(`💰 VENTA VIRTUAL @ $${price} | Net: ${netProfit.toFixed(2)}`, 1);
            }

            // Persistir orden
            await AIBotOrder.create({
                side, price, amount: amountInUSDT,
                isVirtual: true, confidenceScore: Math.round(confidence * 100),
                timestamp: new Date()
            });

            // Persistir estado IA
            await Aibot.updateOne({}, { 
                virtualBalance: this.virtualBalance,
                lastEntryPrice: this.lastEntryPrice,
                highestPrice: this.highestPrice,
                lastUpdate: new Date()
            });

            if (this.io) {
                this.io.emit('ai-order-executed', { side, price, balance: this.virtualBalance });
            }
            this._broadcastStatus();
        } catch (err) {
            console.error("❌ Error en _trade IA:", err);
        }
    }

    _log(msg, conf, isAnalyzing = false) {
        if (this.io) {
            this.io.emit('ai-decision-update', { confidence: conf, message: msg, isAnalyzing });
        }
    }

    _broadcastStatus() {
        if (this.io) {
            this.io.emit('ai-status-update', {
                isRunning: this.isRunning,
                virtualBalance: this.virtualBalance,
                historyCount: this.history.length,
                lastEntryPrice: this.lastEntryPrice,
                highestPrice: this.highestPrice
            });
        }
    }
}

module.exports = new AIEngine();