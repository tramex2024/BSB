// server/src/ai/aiEngine.js

const Autobot = require('../../models/Autobot');
const AIBotOrder = require('../../models/AIBotOrder');
const StrategyManager = require('./StrategyManager');
const CandleBuilder = require('./CandleBuilder');

class AIEngine {
    constructor() {
        this.isRunning = false;
        this.io = null;

        // --- MASTER SWITCH: MODO VIRTUAL O REAL ---
        // 🔴 Cambiar a false cuando estés listo para operar con el bot real
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
        const state = await Autobot.findOne({});
        this.virtualBalance = state?.virtualAiBalance || 1000.00;
        const modeDesc = this.IS_VIRTUAL_MODE ? "VIRTUAL (Paper Trading)" : "REAL (Cuidado)";
        this._log(`Sistema Iniciado en modo: ${modeDesc}`, 0.5);
    }

    async analyze(price) {
        if (!this.isRunning) return;

        // 1. MODO PÁNICO (Solo aplica en Virtual por ahora)
        if (this.IS_VIRTUAL_MODE && this.virtualBalance <= this.PANIC_STOP_BALANCE) {
            this.isRunning = false;
            this._log("🚨 MODO PÁNICO ACTIVADO. IA Detenida.", 0);
            return;
        }

        // 2. TRAILING STOP
        if (this.lastEntryPrice > 0) {
            if (price > this.highestPrice) this.highestPrice = price;
            const stopPrice = this.highestPrice * (1 - this.TRAILING_PERCENT);
            if (price <= stopPrice) {
                this._log(`🚨 Trailing Stop en ${price.toFixed(2)}`, 0.9);
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

        const { adx, stoch } = StrategyManager.calculate(this.history);
        if (!adx || !stoch) return;

        let confidence = adx.adx / 100;

        // Lógica de Compra
        if (adx.adx > 25 && adx.pdi > adx.mdi && stoch.stochK < 80 && this.lastEntryPrice === 0) {
            await this._trade('BUY', price, confidence);
        } 
        // Lógica de Venta
        else if (adx.adx > 25 && adx.mdi > adx.pdi && this.lastEntryPrice > 0) {
            await this._trade('SELL', price, confidence);
        }
    }

    async _trade(side, price, conf) {
        try {
            // CÁLCULO DE MONTO
            let amount = this.virtualBalance * this.RISK_PER_TRADE;
            if (amount < this.MIN_TRADE_AMOUNT) amount = this.MIN_TRADE_AMOUNT;

            if (this.IS_VIRTUAL_MODE) {
                // --- EJECUCIÓN VIRTUAL ---
                const newOrder = new AIBotOrder({ 
                    symbol: 'BTC_USDT', side, price, amount, isVirtual: true, confidenceScore: (conf * 100).toFixed(2) 
                });
                await newOrder.save();

                if (side === 'BUY') {
                    this.lastEntryPrice = price;
                    this.highestPrice = price;
                    this.virtualBalance -= amount;
                } else {
                    const performance = (price / this.lastEntryPrice) - 1;
                    const profitReal = (amount * performance) - ((amount * (1 + performance)) * 0.001);
                    this.virtualBalance += (amount + profitReal);
                    
                    this.tradeLog.push({ profit: profitReal, performance });
                    this._autoOptimize();
                    this.lastEntryPrice = 0;
                    this.highestPrice = 0;
                }

                await Autobot.updateOne({}, { $set: { virtualAiBalance: this.virtualBalance } });
                if (this.io) this.io.emit('ai-order-executed', { isVirtual: true, balance: this.virtualBalance });
                this._log(`IA ${side} Virtual Ejecutada`, conf);

            } else {
                // --- 🟢 AQUÍ IRÁ LA CONEXIÓN AL BOT REAL EN EL FUTURO ---
                this._log(`IA intentó operar en REAL: ${side} (Funcionalidad bloqueada)`, 1);
            }

        } catch (e) { console.error("Error en Trade:", e); }
    }

    _autoOptimize() {
        if (this.tradeLog.length < 5) return;
        const lastFive = this.tradeLog.slice(-5);
        const winRate = lastFive.filter(t => t.profit > 0).length / 5;

        if (winRate < 0.4) {
            this.RISK_PER_TRADE = Math.max(0.05, this.RISK_PER_TRADE - 0.01);
            this.TRAILING_PERCENT = Math.max(0.003, this.TRAILING_PERCENT - 0.001);
        } else if (winRate > 0.8) {
            this.RISK_PER_TRADE = Math.min(0.20, this.RISK_PER_TRADE + 0.01);
            this.TRAILING_PERCENT = Math.min(0.015, this.TRAILING_PERCENT + 0.002);
        }
    }

    _log(msg, conf) {
        if (this.io) this.io.emit('ai-decision-update', { confidence: conf, message: msg });
    }
}

module.exports = new AIEngine();