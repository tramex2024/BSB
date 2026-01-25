server/src/ai/AIEngine.js

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
        this.TRAILING_PERCENT = 0.003; // 0.3%
        this.RISK_PER_TRADE = 0.10;    // Usar 10% del capital por trade
        this.EXCHANGE_FEE = 0.001;     // 0.1% comisión
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
            this.virtualBalance = state.virtualBalance || 100.00;
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
        if (!this.isRunning) {
            this.history = [];
            this.lastEntryPrice = 0;
            this.highestPrice = 0;
        }
        
        await Aibot.updateOne({}, { 
            isRunning: this.isRunning, 
            historyPoints: this.history,
            lastEntryPrice: this.lastEntryPrice,
            highestPrice: this.highestPrice
        });

        this._log(this.isRunning ? "🚀 NÚCLEO IA: ONLINE" : "🛑 NÚCLEO IA: OFFLINE", this.isRunning ? 1 : 0);
        return { isRunning: this.isRunning, virtualBalance: this.virtualBalance };
    }

    async analyze(price) {
        if (!this.isRunning) return;

        // Gestión de Trailing Stop para posiciones abiertas
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

            // Persistencia del progreso
            await Aibot.updateOne({}, { historyPoints: this.history });
            await this._executeStrategy(price);
        }
    }

    async _executeStrategy(price) {
        const currentProgress = this.history.length;
        
        if (currentProgress < 30) {
            this._log(`Analizando mercado... (${currentProgress}/30)`, 0.2, true);
            return;
        }

        const analysis = StrategyManager.calculate(this.history);
        if (!analysis) {
            this._log("⚠️ Datos insuficientes para indicadores.", 0.1);
            return;
        }

        const { rsi, adx, trend, confidence } = analysis;
        let pensamiento = `Análisis: RSI(${rsi.toFixed(1)}) | ADX(${adx.toFixed(1)}) | Trend: ${trend.toUpperCase()}`;
        
        if (this.lastEntryPrice === 0) {
            if (confidence < 0.7) {
                pensamiento += ` | Confianza ${(confidence * 100).toFixed(0)}% (Mín. 70%)`;
                this._log(pensamiento, confidence);
            } else {
                await this._trade('BUY', price, confidence);
            }
        } else {
            const profit = ((price - this.lastEntryPrice) / this.lastEntryPrice * 100).toFixed(2);
            this._log(`Posición Abierta: ${profit}% | TrailStop: $${(this.highestPrice * (1-this.TRAILING_PERCENT)).toFixed(2)}`, 0.9);
        }
    }

    /**
     * Lógica interna para ejecutar trades virtuales
     */
    async _trade(side, price, confidence) {
        try {
            const amountInUSDT = this.virtualBalance * this.RISK_PER_TRADE;
            const fee = amountInUSDT * this.EXCHANGE_FEE;
            
            if (side === 'BUY') {
                this.lastEntryPrice = price;
                this.highestPrice = price;
                this.virtualBalance -= fee; // Descontar comisión
                this._log(`🔥 COMPRA VIRTUAL: $${price} (Confianza: ${Math.round(confidence * 100)}%)`, 1);
            } else {
                const profitPct = (price - this.lastEntryPrice) / this.lastEntryPrice;
                const profitAmount = (amountInUSDT * profitPct) - fee;
                this.virtualBalance += profitAmount;
                this.lastEntryPrice = 0;
                this.highestPrice = 0;
                this._log(`💰 VENTA VIRTUAL (Exit): $${price} | Resultado: ${profitAmount.toFixed(2)} USDT`, 0.5);
            }

            // Guardar en MongoDB
            await AIBotOrder.create({
                side,
                price,
                amount: amountInUSDT,
                isVirtual: true,
                confidenceScore: Math.round(confidence * 100),
                timestamp: new Date()
            });

            await Aibot.updateOne({}, { 
                virtualBalance: this.virtualBalance,
                lastEntryPrice: this.lastEntryPrice,
                highestPrice: this.highestPrice
            });

            // Notificar al Frontend
            if (this.io) {
                this.io.emit('ai-order-executed', {
                    side,
                    price,
                    amount: amountInUSDT,
                    virtualBalance: this.virtualBalance,
                    timestamp: new Date()
                });
            }
        } catch (error) {
            console.error("Error en _trade:", error);
        }
    }

    _log(msg, conf, isAnalyzing = false) {
        if (this.io) {
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