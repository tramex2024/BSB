const Aibot = require('../../models/Aibot');
const AIBotOrder = require('../../models/AIBotOrder');
const StrategyManager = require('./StrategyManager');
const CandleBuilder = require('./CandleBuilder');

class AIEngine {
    constructor() {
        this.isRunning = false;
        this.io = null;
        this.IS_VIRTUAL_MODE = true; 
        this.history = [];
        this.virtualBalance = 100.00;
        this.lastEntryPrice = 0;
        this.highestPrice = 0;

        // PARÁMETROS
        this.TRAILING_PERCENT = 0.003;
        this.RISK_PER_TRADE = 0.10;    
        this.PANIC_STOP_BALANCE = 20.00; 
        this.EXCHANGE_FEE = 0.001;
    }

    setIo(io) { 
        this.io = io; 
        this.init(); 
    }

    async init() {
        try {
            let state = await Aibot.findOne({});
            if (!state) state = await Aibot.create({});

            this.isRunning = state.isRunning;
            this.virtualBalance = state.virtualBalance;
            this.history = state.historyPoints || [];
            this.lastEntryPrice = state.lastEntryPrice || 0;
            this.highestPrice = state.highestPrice || 0;

            this._log(this.isRunning ? "🚀 Núcleo IA Recuperado" : "💤 Núcleo en Standby", 0.5);
        } catch (e) {
            console.error("Error en init de AIEngine:", e);
        }
    }

    async toggle(action) {
        this.isRunning = (action === 'start');
        // Si detenemos, limpiamos el historial para empezar de cero la próxima vez
        if (!this.isRunning) this.history = [];
        
        await Aibot.updateOne({}, { 
            isRunning: this.isRunning, 
            historyPoints: this.history 
        });

        this._log(this.isRunning ? "🚀 NÚCLEO IA: ONLINE" : "🛑 NÚCLEO IA: OFFLINE", this.isRunning ? 1 : 0);
        return { isRunning: this.isRunning, virtualBalance: this.virtualBalance };
    }

    async analyze(price) {
        if (!this.isRunning) return;

        // Gestión de Trailing Stop...
        if (this.lastEntryPrice > 0) {
            if (price > this.highestPrice) this.highestPrice = price;
            const stopPrice = this.highestPrice * (1 - this.TRAILING_PERCENT);
            if (price <= stopPrice) {
                await this._trade('SELL', price, 0.95);
                return; 
            }
        }

        const closedCandle = CandleBuilder.processTick(price);
        if (closedCandle) {
            this.history.push(closedCandle);
            if (this.history.length > 50) this.history.shift();

            // ✅ PERSISTENCIA: Guardamos el progreso de velas en la DB
            await Aibot.updateOne({}, { historyPoints: this.history });
            
            await this._executeStrategy(price);
        }
    }

    async _executeStrategy(price) {
        const currentProgress = this.history.length;
        
        if (currentProgress < 30) {
            // Enviamos mensaje especial de "Procesando" (Verde en el front)
            this._log(`Analizando mercado... (${currentProgress}/30)`, 0.2, true);
            return;
        }

        const analysis = StrategyManager.calculate(this.history);
        if (!analysis || !analysis.adx) return;

        // Lógica de compra/venta... (Tu estrategia actual)
        // Al ejecutar trade, actualizamos Aibot.updateOne con el nuevo balance y entryPrice
    }

    _log(msg, conf, isAnalyzing = false) {
        if (this.io) {
            // Añadimos 'isAnalyzing' para que el Front sepa si ponerse verde o rojo
            this.io.emit('ai-decision-update', { 
                confidence: conf, 
                message: msg, 
                isAnalyzing: isAnalyzing 
            });
        }
    }
}

const engine = new AIEngine();
module.exports = engine;