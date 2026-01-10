// server/src/ai/aiEngine.js

const Autobot = require('../../models/Autobot');
const AIBotOrder = require('../../models/AIBotOrder');
const StrategyManager = require('./StrategyManager');
const CandleBuilder = require('./CandleBuilder');

class AIEngine {
    constructor() {
        this.isRunning = false;
        this.io = null;

        // --- MASTER SWITCH ---
        this.IS_VIRTUAL_MODE = true; 

        // --- ESTADO Y MEMORIA ---
        this.history = [];
        this.tradeLog = [];
        this.virtualBalance = 0;
        this.lastEntryPrice = 0;
        this.highestPrice = 0;

        // --- PARÁMETROS DINÁMICOS ---
        this.TRAILING_PERCENT = 0.005; 
        this.RISK_PER_TRADE = 0.10;    
        
        // --- SEGURIDAD ---
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
            const modeDesc = this.IS_VIRTUAL_MODE ? "VIRTUAL (Paper Trading)" : "REAL";
            this._log(`Sistema Iniciado en modo: ${modeDesc}`, 0.5);
        } catch (e) {
            console.error("Error en init de AIEngine:", e);
        }
    }

    // Método para el controlador
    toggle(action) {
        this.isRunning = (action === 'start');
        this._log(this.isRunning ? "🚀 NÚCLEO IA: ONLINE" : "🛑 NÚCLEO IA: OFFLINE", this.isRunning ? 1 : 0);
        return this.isRunning;
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            virtualBalance: this.virtualBalance,
            config: {
                risk: this.RISK_PER_TRADE,
                trailing: this.TRAILING_PERCENT
            }
        };
    }

    async analyze(price) {
        if (!this.isRunning) return;

        // 1. MODO PÁNICO
        if (this.IS_VIRTUAL_MODE && this.virtualBalance <= this.PANIC_STOP_BALANCE) {
            this.isRunning = false;
            this._log("🚨 PÁNICO: Saldo insuficiente. IA Detenida.", 0);
            return;
        }

        // 2. TRAILING STOP
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
        if (this.history.length < 28) return;

        const analysis = StrategyManager.calculate(this.history);
        if (!analysis || !analysis.adx || !analysis.stoch) return;

        const { adx, stoch } = analysis;
        let confidence = adx.adx / 100;

        if (adx.adx > 25 && adx.pdi > adx.mdi && stoch.stochK < 80 && this.lastEntryPrice === 0) {
            await this._trade('BUY', price, confidence);
        } 
        else if (adx.adx > 25 && adx.mdi > adx.pdi && this.lastEntryPrice > 0) {
            await this._trade('SELL', price, confidence);
        }
    }

    async _trade(side, price, conf) {
        try {
            let amount = this.virtualBalance * this.RISK_PER_TRADE;
            if (amount < this.MIN_TRADE_AMOUNT) amount = this.MIN_TRADE_AMOUNT;

            if (this.IS_VIRTUAL_MODE) {
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
                    this._autoOptimize();
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
            }
        } catch (e) {
            console.error("Error en Trade:", e);
        }
    }

    _autoOptimize() {
        if (this.tradeLog.length < 5) return;
        const lastFive = this.tradeLog.slice(-5);
        const winRate = lastFive.filter(t => t.profit > 0).length / 5;

        if (winRate < 0.4) {
            this.RISK_PER_TRADE = Math.max(0.05, this.RISK_PER_TRADE - 0.01);
        } else if (winRate > 0.8) {
            this.RISK_PER_TRADE = Math.min(0.20, this.RISK_PER_TRADE + 0.01);
        }
    }

    _log(msg, conf) {
        if (this.io) {
            this.io.emit('ai-decision-update', { confidence: conf, message: msg });
        }
    }
}

// Exportación limpia
const engine = new AIEngine();
module.exports = engine;