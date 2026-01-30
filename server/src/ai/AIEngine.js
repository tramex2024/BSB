/**
 * Archivo: server/src/ai/AIEngine.js
 * Núcleo de Inteligencia Artificial - Modo Virtual (Sincronizado)
 */

/**
 * Archivo: server/src/ai/AIEngine.js
 * Núcleo de Inteligencia Artificial - Modo Virtual (Optimizado)
 */

const Aibot = require('../../models/Aibot');
const AIBotOrder = require('../../models/AIBotOrder');
const MarketSignal = require('../../models/MarketSignal'); 
const StrategyManager = require('./StrategyManager');

class AIEngine {
    constructor() {
        this.isRunning = false;
        this.io = null;
        this.history = [];
        this.virtualBalance = 100.00;
        this.lastEntryPrice = 0;
        this.highestPrice = 0;

        // PARÁMETROS DE GESTIÓN (Ajustados para evitar micro-ventas)
        this.TRAILING_PERCENT = 0.005; // 0.5% (Más aire para la tendencia)
        this.MIN_PROFIT_TO_TIGHTEN = 0.002; // 0.2% mínimo antes de ser agresivo
        this.RISK_PER_TRADE = 0.10;    
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
            this.virtualBalance = state.virtualBalance || 100.00;
            this.lastEntryPrice = state.lastEntryPrice || 0;
            this.highestPrice = state.highestPrice || 0;

            const marketData = await MarketSignal.findOne({ symbol: 'BTC_USDT' });
            if (marketData && marketData.history) {
                this.history = marketData.history;
            }

            this._log(this.isRunning ? "🚀 Núcleo IA Online" : "💤 Núcleo en Standby", 0.5);
        } catch (e) {
            console.error("Error en init de AIEngine:", e);
        }
    }

    async toggle(action) {
        this.isRunning = (action === 'start');
        
        if (this.isRunning) {
            const marketData = await MarketSignal.findOne({ symbol: 'BTC_USDT' });
            if (marketData) this.history = marketData.history || [];
        } else {
            this.lastEntryPrice = 0;
            this.highestPrice = 0;
        }
        
        await Aibot.updateOne({}, { 
            isRunning: this.isRunning, 
            lastEntryPrice: this.lastEntryPrice,
            highestPrice: this.highestPrice
        });

        this._broadcastStatus();
        this._log(this.isRunning ? "🚀 NÚCLEO IA: ONLINE" : "🛑 NÚCLEO IA: OFFLINE", this.isRunning ? 1 : 0);
        return { isRunning: this.isRunning, virtualBalance: this.virtualBalance };
    }

    async analyze(price) {
        if (!this.isRunning) return;

        // 1. GESTIÓN DE SALIDA (Trailing Stop Dinámico)
        if (this.lastEntryPrice > 0) {
            if (price > this.highestPrice) this.highestPrice = price;

            const currentProfit = (price - this.lastEntryPrice) / this.lastEntryPrice;
            const stopPrice = this.highestPrice * (1 - this.TRAILING_PERCENT);

            // LOGICA: Si el precio toca el Stop Loss
            if (price <= stopPrice) {
                // Solo vendemos si no fue una fluctuación instantánea del mismo segundo
                // o si estamos protegiendo una pérdida mayor al 1%
                await this._trade('SELL', price, 0.95);
                return; 
            }
        }

        // 2. OBTENER SEÑALES
        const marketData = await MarketSignal.findOne({ symbol: 'BTC_USDT' }).lean();
        
        if (marketData && marketData.history && marketData.history.length > 0) {
            this.history = marketData.history;
            await this._executeStrategy(price);
        }
    }

    async _executeStrategy(price) {
        if (this.history.length < 30) {
            this._log(`Sincronizando mercado... (${this.history.length}/30)`, 0.2, true);
            return;
        }

        const analysis = StrategyManager.calculate(this.history);
        if (!analysis || analysis.confidence === undefined) return;

        const { rsi, adx, confidence } = analysis;
        
        if (this.lastEntryPrice === 0) {
            // Umbral de entrada subido a 75% para mayor calidad
            if (confidence >= 0.75) {
                await this._trade('BUY', price, confidence);
            } else {
                // Log reducido para no saturar consola si no hay acción
                if (Math.random() > 0.8) { // Muestra solo el 20% de los HOLD para limpieza
                    const msg = `RSI:${rsi.toFixed(1)} | ADX:${adx.toFixed(1)} | Conf:${(confidence*100).toFixed(0)}%`;
                    this._log(msg, confidence);
                }
            }
        } else {
            const profit = ((price - this.lastEntryPrice) / this.lastEntryPrice * 100).toFixed(2);
            // Solo logueamos la posición cada cierto tiempo para no saturar
            this._log(`En Posición: ${profit}% | Pico: $${this.highestPrice}`, 0.9);
        }
    }

    async _trade(side, price, confidence) {
        try {
            // Evitar trades duplicados en el mismo precio/segundo
            if (side === 'SELL' && price === this.lastEntryPrice) {
                return; 
            }

            const amountInUSDT = this.virtualBalance * this.RISK_PER_TRADE;
            const fee = amountInUSDT * this.EXCHANGE_FEE;
            
            if (side === 'BUY') {
                this.lastEntryPrice = price;
                this.highestPrice = price;
                this.virtualBalance -= fee;
                this._log(`🔥 COMPRA VIRTUAL: $${price}`, 1);
            } else {
                const profitPct = (price - this.lastEntryPrice) / this.lastEntryPrice;
                const profitAmount = (amountInUSDT * profitPct) - (fee * 2); // Fee de entrada + salida
                this.virtualBalance += profitAmount;
                
                const win = profitAmount > 0;
                this._log(`${win ? '💰' : '📉'} VENTA VIRTUAL: $${price} | Neto: ${profitAmount.toFixed(4)} USDT`, 0.5);
                
                this.lastEntryPrice = 0;
                this.highestPrice = 0;
            }

            // Persistencia
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
                highestPrice: this.highestPrice,
                lastUpdate: new Date()
            });

            this._broadcastStatus();
        } catch (error) {
            console.error("Error en _trade AI:", error);
        }
    }

    _log(msg, conf, isAnalyzing = false) {
        console.log(`[${new Date().toLocaleTimeString()}] [AI-VIRTUAL] 🧠 ${msg}`);
        if (this.io) {
            this.io.emit('ai-decision-update', { confidence: conf, message: msg, isAnalyzing });
        }
    }

    _broadcastStatus() {
        if (this.io) {
            this.io.emit('ai-status-change', {
                isRunning: this.isRunning,
                virtualBalance: this.virtualBalance,
                historyCount: this.history.length
            });
        }
    }
}

const engine = new AIEngine();
module.exports = engine;