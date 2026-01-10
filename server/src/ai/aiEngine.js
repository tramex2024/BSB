// Archivo: server/src/ai/aiEngine.js

const Autobot = require('../../models/Autobot');
const AIBotOrder = require('../../models/AIBotOrder');
const StrategyManager = require('./StrategyManager');
const CandleBuilder = require('./CandleBuilder');

class AIEngine {
    constructor() {
        this.isRunning = false;
        this.io = null;
        this.IS_VIRTUAL_MODE = true; 

        this.history = [];
        this.tradeLog = [];
        this.virtualBalance = 0;
        this.lastEntryPrice = 0;
        this.highestPrice = 0;

        this.TRAILING_PERCENT = 0.005; 
        this.RISK_PER_TRADE = 0.10;    
        this.PANIC_STOP_BALANCE = 800.00; 
        this.MIN_TRADE_AMOUNT = 10.00;
    }

    setIo(io) { 
        this.io = io; 
        this.init(); 
    }

    async init() {
        try {
            const state = await Autobot.findOne({});
            this.virtualBalance = state?.virtualAiBalance || 1000.00;
            this._log(`Sistema Iniciado: Modo Virtual`, 0.5);
        } catch (e) {
            console.error("Error en init de AIEngine:", e);
        }
    }

    toggle(action) {
        this.isRunning = (action === 'start');
        this._log(this.isRunning ? "🚀 NÚCLEO IA: ONLINE" : "🛑 NÚCLEO IA: OFFLINE", this.isRunning ? 1 : 0);
        return { isRunning: this.isRunning, virtualBalance: this.virtualBalance };
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            virtualBalance: this.virtualBalance,
            config: { risk: this.RISK_PER_TRADE, trailing: this.TRAILING_PERCENT }
        };
    }

    async analyze(price) {
        if (!this.isRunning) return;

        if (this.IS_VIRTUAL_MODE && this.virtualBalance <= this.PANIC_STOP_BALANCE) {
            this.isRunning = false;
            this._log("🚨 PÁNICO: Saldo insuficiente.", 0);
            return;
        }

        if (this.lastEntryPrice > 0) {
            if (price > this.highestPrice) this.highestPrice = price;
            const stopPrice = this.highestPrice * (1 - this.TRAILING_PERCENT);
            if (price <= stopPrice) {
                await this._trade('SELL', price, 0.9);
                return; 
            }
        }

        const closedCandle = CandleBuilder.processTick(price);
        if (closedCandle) {
            this.history.push(closedCandle);
            if (this.history.length > 50) this.history.shift();
            await this._executeStrategy(price);
        }
    }

    async _executeStrategy(price) {
        // Reducido a 5 para el test de estrés
        if (this.history.length < 5) {
            this._log(`Construyendo memoria neural... (${this.history.length}/5)`, 0.2);
            return;
        }

        const analysis = StrategyManager.calculate(this.history);
        
        // Lógica de respaldo ultra-sensible para el test
        if (!analysis || !analysis.adx) {
            const prevPrice = this.history[this.history.length - 2].close;
            if (price > prevPrice && this.lastEntryPrice === 0) {
                await this._trade('BUY', price, 0.85);
            } else if (price < prevPrice && this.lastEntryPrice > 0) {
                await this._trade('SELL', price, 0.85);
            }
            return;
        }

        const { adx } = analysis;
        // ADX > 5 para que dispare casi siempre durante el test
        if (adx.adx > 5 && adx.pdi > adx.mdi && this.lastEntryPrice === 0) {
            await this._trade('BUY', price, 0.85);
        } 
        else if (adx.mdi > adx.pdi && this.lastEntryPrice > 0) {
            await this._trade('SELL', price, 0.85);
        }
    }

    async _trade(side, price, conf) {
        try {
            let amount = this.virtualBalance * this.RISK_PER_TRADE;
            if (amount < this.MIN_TRADE_AMOUNT) amount = this.MIN_TRADE_AMOUNT;

            const newOrder = new AIBotOrder({ 
                symbol: 'BTC_USDT', side, price, amount, isVirtual: true, confidenceScore: (conf * 100).toFixed(2) 
            });
            await newOrder.save();

            let pnlLast = 0;
            if (side === 'BUY') {
                this.lastEntryPrice = price;
                this.highestPrice = price;
                this.virtualBalance -= amount;
            } else {
                const perf = (price / this.lastEntryPrice) - 1;
                pnlLast = (amount * perf) - ((amount * (1 + perf)) * 0.001);
                this.virtualBalance += (amount + pnlLast);
                this.tradeLog.push({ profit: pnlLast });
                this.lastEntryPrice = 0;
                this.highestPrice = 0;
            }

            await Autobot.updateOne({}, { $set: { virtualAiBalance: this.virtualBalance } });

            if (this.io) {
                this.io.emit('ai-order-executed', { 
                    side,
                    price: price.toFixed(2),
                    currentVirtualBalance: this.virtualBalance,
                    pnlLastTrade: pnlLast.toFixed(2)
                });
            }
            this._log(`IA ${side} Virtual Ejecutada`, conf);
        } catch (e) {
            console.error("Error en Trade:", e);
        }
    }

    _log(msg, conf) {
        if (this.io) {
            this.io.emit('ai-decision-update', { confidence: conf, message: msg });
        }
    }

    // Añadido para el historial por socket
    async getVirtualHistory() {
        return await AIBotOrder.find({ isVirtual: true }).sort({ timestamp: -1 }).limit(20);
    }
}

const engine = new AIEngine();
module.exports = engine;