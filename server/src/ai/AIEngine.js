/**
 * Archivo: server/src/ai/AIEngine.js
 * Versión: Unificada (Usa Autobot Model y Order Model)
 */

const Autobot = require('../../models/Autobot');
const Order = require('../../models/Order'); // 👈 Unificado
const MarketSignal = require('../../models/MarketSignal'); 
const StrategyManager = require('./StrategyManager');

class AIEngine {
    constructor() {
        this.isRunning = false;
        this.io = null;
        this.history = [];
        this.virtualBalance = 0; 
        this.amountUsdt = 0;      
        this.lastEntryPrice = 0;
        this.highestPrice = 0;
        this.stopAtCycle = false;

        this.TRAILING_PERCENT = 0.005; // 0.5%
        this.EXCHANGE_FEE = 0.001;     // 0.1%
    }

    setIo(io) { 
        this.io = io; 
        this.init(); 
    }

    async init() {
        try {
            // Buscamos el estado en el documento unificado de Autobot
            let bot = await Autobot.findOne({});
            if (!bot) {
                console.warn("⚠️ Autobot no inicializado. Esperando creación...");
                return;
            }

            // Sincronizamos memoria con la DB (Rama AI)
            this.isRunning = (bot.aistate === 'RUNNING');
            this.amountUsdt = bot.config.ai?.amountUsdt || 100.00;
            
            // Usamos aibalance o el capital inicial si está en 0
            this.virtualBalance = (bot.aibalance > 0) ? bot.aibalance : this.amountUsdt;
            
            this.lastEntryPrice = bot.ailastEntryPrice || 0;
            this.highestPrice = bot.aihighestPrice || 0;
            this.stopAtCycle = bot.config.ai?.stopAtCycle || false;

            this._broadcastStatus();
            this._log(this.isRunning ? "🚀 IA Unificada Online" : "💤 IA en Standby", 0.5);
        } catch (e) {
            console.error("❌ Error en init de AIEngine:", e);
        }
    }

    async toggle(action) {
        const isStarting = (action === 'start');
        
        // Actualizamos en DB usando el esquema unificado
        const updatedBot = await Autobot.findOneAndUpdate(
            {},
            { 
                $set: { 
                    aistate: isStarting ? 'RUNNING' : 'STOPPED',
                    'config.ai.enabled': isStarting
                } 
            },
            { new: true }
        );

        if (updatedBot) {
            this.isRunning = isStarting;
            this.amountUsdt = updatedBot.config.ai.amountUsdt;
            this.stopAtCycle = updatedBot.config.ai.stopAtCycle;
            
            if (isStarting) {
                this.virtualBalance = updatedBot.aibalance || updatedBot.config.ai.amountUsdt;
            }
        }

        this._broadcastStatus();
        this._log(this.isRunning ? "🚀 NÚCLEO IA: ACTIVADO" : "🛑 NÚCLEO IA: DETENIDO", isStarting ? 0.9 : 0);
        
        return { 
            isRunning: this.isRunning, 
            virtualBalance: this.virtualBalance,
            stopAtCycle: this.stopAtCycle 
        };
    }

    async analyze(price) {
        if (!this.isRunning) return;

        // Lógica de Trailing Stop (Usando memoria sincronizada)
        if (this.lastEntryPrice > 0) {
            if (price > this.highestPrice) {
                this.highestPrice = price;
            }
            const stopPrice = this.highestPrice * (1 - this.TRAILING_PERCENT);
            if (price <= stopPrice) {
                this._log(`🎯 Trailing Stop activado en $${price}`, 0.95);
                await this._trade('SELL', price, 1.0);
                return; 
            }
        }

        const marketData = await MarketSignal.findOne({ symbol: 'BTC_USDT' }).lean();
        if (marketData && marketData.history) {
            this.history = marketData.history;
            await this._executeStrategy(price);
        }
    }

    async _executeStrategy(price) {
        if (this.history.length < 50) return;

        const analysis = StrategyManager.calculate(this.history);
        if (!analysis) return;

        const { confidence, message } = analysis;
        
        if (this.lastEntryPrice === 0) {
            if (confidence >= 0.85) {
                await this._trade('BUY', price, confidence);
            } else {
                if (Math.random() > 0.98) this._log(message, confidence);
            }
        }
    }

    async _trade(side, price, confidence) {
        try {
            const tradeAmountUSDT = this.virtualBalance;
            const fee = tradeAmountUSDT * this.EXCHANGE_FEE;
            
            if (side === 'BUY') {
                this.lastEntryPrice = price;
                this.highestPrice = price;
                this.virtualBalance -= fee;
                this._log(`🔥 COMPRA IA: BTC @ $${price}`, 1);
            } else {
                const profitPct = (price - this.lastEntryPrice) / this.lastEntryPrice;
                const netProfit = (tradeAmountUSDT * profitPct) - (fee); 
                
                this.virtualBalance += netProfit;
                this._log(`💰 VENTA IA: BTC @ $${price} | PNL: $${netProfit.toFixed(2)} USDT`, 1);
                
                this.lastEntryPrice = 0;
                this.highestPrice = 0;

                if (this.stopAtCycle) {
                    this.isRunning = false;
                    this.stopAtCycle = false;
                    this._log("🛑 CICLO COMPLETADO: Auto-apagado.", 0.5);
                }
            }

            // --- PERSISTENCIA EN DOCUMENTO ÚNICO ---
            await Autobot.updateOne({}, { 
                $set: {
                    aibalance: this.virtualBalance,
                    ailastEntryPrice: this.lastEntryPrice,
                    aihighestPrice: this.highestPrice,
                    aistate: this.isRunning ? 'RUNNING' : 'STOPPED',
                    'config.ai.stopAtCycle': this.stopAtCycle
                },
                $inc: { total_profit: side === 'SELL' ? (tradeAmountUSDT * ((price - this.lastEntryPrice)/this.lastEntryPrice)) : 0 }
            });

            // --- REGISTRO EN HISTORIAL UNIFICADO ---
            await Order.create({
                strategy: 'ai',
                executionMode: 'SIMULATED', // Tal como pediste
                orderId: `ai_order_${Date.now()}`,
                side: side,
                price: price,
                size: tradeAmountUSDT / price,
                notional: tradeAmountUSDT,
                confidenceScore: Math.round(confidence * 100),
                status: 'FILLED'
            });

            this._broadcastStatus();
        } catch (error) {
            console.error("❌ Error en trade IA:", error);
        }
    }

    _broadcastStatus() {
        if (this.io) {
            this.io.emit('ai-status-update', {
                isRunning: this.isRunning,
                aibalance: parseFloat(this.virtualBalance || 0),
                amountUsdt: this.amountUsdt,
                historyCount: this.history.length,
                lastEntryPrice: this.lastEntryPrice,
                stopAtCycle: this.stopAtCycle
            });
        }
    }

    _log(msg, conf, isAnalyzing = false) {
        if (this.io) {
            this.io.emit('ai-decision-update', { confidence: conf, message: msg, isAnalyzing });
        }
    }
}

const engine = new AIEngine();
module.exports = engine;