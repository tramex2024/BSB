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

    // server/src/ai/aiEngine.js

async _executeStrategy(price) {
    // Bajamos el requisito de historial de 28 a 5 velas para el test
    if (this.history.length < 5) {
        this._log(`Construyendo memoria neural... (${this.history.length}/5)`, 0.2);
        return;
    }

    const analysis = StrategyManager.calculate(this.history);
    // Si StrategyManager no devuelve datos por falta de velas, usamos lógica simple de precio
    if (!analysis || !analysis.adx) {
        // Lógica de respaldo para el test: si el precio sube, compra; si baja, vende.
        const prevPrice = this.history[this.history.length - 2].close;
        if (price > prevPrice && this.lastEntryPrice === 0) {
            await this._trade('BUY', price, 0.5);
        } else if (price < prevPrice && this.lastEntryPrice > 0) {
            await this._trade('SELL', price, 0.5);
        }
        return;
    }

    const { adx, stoch } = analysis;
    
    // --- TEST: UMBRALES MÍNIMOS (ADX > 5 en lugar de 25) ---
    let confidence = 0.85; 

    // Condición de COMPRA ultra-sensible
    if (adx.adx > 5 && adx.pdi > adx.mdi && this.lastEntryPrice === 0) {
        await this._trade('BUY', price, confidence);
    } 
    // Condición de VENTA ultra-sensible
    else if ((adx.mdi > adx.pdi || price < this.lastEntryPrice * 0.998) && this.lastEntryPrice > 0) {
        await this._trade('SELL', price, confidence);
    }
}

// Exportación limpia
const engine = new AIEngine();
module.exports = engine;