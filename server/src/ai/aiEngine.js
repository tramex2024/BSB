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
    
    // Dentro de la clase AIEngine en aiEngine.js
toggle(action) {
    if (action === 'start') {
        this.isRunning = true;
        this._log("🚀 NÚCLEO IA: INICIADO", 1);
    } else {
        this.isRunning = false;
        this._log("🛑 NÚCLEO IA: DETENIDO", 0);
    }
    return this.isRunning;
}

getStatus() {
    return {
        isRunning: this.isRunning,
        virtualBalance: this.virtualBalance,
        mode: this.IS_VIRTUAL_MODE ? 'VIRTUAL' : 'REAL'
    };
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
                symbol: 'BTC_USDT', 
                side, 
                price, 
                amount, 
                isVirtual: true, 
                confidenceScore: (conf * 100).toFixed(2) 
            });
            await newOrder.save();

            let pnlLast = 0;

            if (side === 'BUY') {
                this.lastEntryPrice = price;
                this.highestPrice = price;
                this.virtualBalance -= amount;
            } else {
                // Cálculo de PNL al vender
                const performance = (price / this.lastEntryPrice) - 1;
                pnlLast = (amount * performance) - ((amount * (1 + performance)) * 0.001);
                this.virtualBalance += (amount + pnlLast);
                
                this.tradeLog.push({ profit: pnlLast, performance });
                this._autoOptimize();
                this.lastEntryPrice = 0;
                this.highestPrice = 0;
            }

            // Guardar balance en la DB
            await Autobot.updateOne({}, { $set: { virtualAiBalance: this.virtualBalance } });

            // 📢 NOTIFICACIÓN AL FRONTEND (Sincronizado con aibot.js)
            if (this.io) {
                this.io.emit('ai-order-executed', { 
                    side: side,
                    price: price.toFixed(2),
                    amount: amount.toFixed(2),
                    currentVirtualBalance: this.virtualBalance, // <--- CAMBIO CLAVE
                    pnlLastTrade: pnlLast.toFixed(2),
                    confidenceScore: (conf * 100).toFixed(0)
                });
            }

            this._log(`IA ${side} Virtual Ejecutada @ ${price}`, conf);

        } else {
            this._log(`IA intentó operar en REAL: ${side} (Bloqueado)`, 1);
        }

    } catch (e) { console.error("Error en Trade:", e); }
}

module.exports = new AIEngine();