// server/src/ai/aiEngine.js

// server/src/ai/aiEngine.js
const Autobot = require('../../models/Autobot');
const AIBotOrder = require('../../models/AIBotOrder');
const StrategyManager = require('./StrategyManager');
const CandleBuilder = require('./CandleBuilder'); // 🟢 Nuevo módulo

class AIEngine {
    constructor() {
        this.isRunning = false;
        this.history = [];
        this.virtualBalance = 0;
        this.io = null;
        this.CONFIDENCE_THRESHOLD = 0.80;
    }

    setIo(io) { this.io = io; this.init(); }

    async init() {
        const state = await Autobot.findOne({});
        this.virtualBalance = state?.virtualAiBalance || 1000.00;
    }

    /**
     * Recibe ticks y delega la construcción de velas y análisis
     */
    async analyze(price) {
        if (!this.isRunning) return;

        // El Builder nos devuelve una vela solo si el minuto acaba de cerrar
        const closedCandle = CandleBuilder.processTick(price);

        if (closedCandle) {
            this.history.push(closedCandle);
            if (this.history.length > 50) this.history.shift();
            
            // Solo ejecutamos la pesada lógica matemática una vez por minuto
            await this._executeStrategy(price);
        }
    }

    async _executeStrategy(price) {
        if (this.history.length < 28) {
            this._log(`IA: Calibrando sensores... (${this.history.length}/28)`, 0.3);
            return;
        }

        const { adx, stoch } = StrategyManager.calculate(this.history);
        if (!adx || !stoch) return;

        let action = "WAIT";
        let confidence = adx.adx / 100;

        // Lógica: Tendencia alcista fuerte + RSI no saturado (Compra)
        if (adx.adx > 25 && adx.pdi > adx.mdi && stoch.stochK < 80) {
            action = "V-BUY";
            await this._trade('BUY', price, confidence);
        } 
        // Lógica: Tendencia bajista fuerte + RSI con espacio para caer (Venta)
        else if (adx.adx > 25 && adx.mdi > adx.pdi && stoch.stochK > 20) {
            action = "V-SELL";
            await this._trade('SELL', price, confidence);
        }

        this._log(`ADX: ${adx.adx.toFixed(0)} | StochK: ${stoch.stochK.toFixed(0)} | ${action}`, confidence);
    }

    async _trade(side, price, conf) {
        try {
            const amount = 100;
            const newOrder = new AIBotOrder({ symbol: 'BTC_USDT', side, price, amount, isVirtual: true, confidenceScore: conf * 100 });
            await newOrder.save();

            // Lógica exponencial simulada: si es venta, asumimos cierre de posición anterior
            this.virtualBalance += (side === 'BUY') ? -amount : (amount * 1.005);
            await Autobot.updateOne({}, { $set: { virtualAiBalance: this.virtualBalance } });
            
            if (this.io) this.io.emit('ai-order-executed', newOrder);
        } catch (e) { console.error("Error AI Trade:", e); }
    }

    _log(msg, conf) {
        if (this.io) this.io.emit('ai-decision-update', { confidence: conf, message: msg });
    }
}

module.exports = new AIEngine();