/**
 * Archivo: server/src/ai/AIEngine.js
 * Núcleo de Inteligencia Artificial - Modo Virtual (Presupuesto Dinámico 2026)
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
        this.virtualBalance = 10000.00; 
        this.lastEntryPrice = 0;
        this.highestPrice = 0;

        // PARÁMETROS DE GESTIÓN
        this.TRAILING_PERCENT = 0.005; // 0.5%
        this.RISK_PER_TRADE = 0.10;    // 10% del capital por operación
        this.EXCHANGE_FEE = 0.001;     // 0.1% comisión
    }

    setIo(io) { 
        this.io = io; 
        this.init(); 
    }

    async init() {
        try {
            let state = await Aibot.findOne({});
            if (!state) state = await Aibot.create({ virtualBalance: 10000.00, isRunning: false });

            this.isRunning = state.isRunning;
            this.virtualBalance = state.virtualBalance || 10000.00;
            this.lastEntryPrice = state.lastEntryPrice || 0;
            this.highestPrice = state.highestPrice || 0;

            const marketData = await MarketSignal.findOne({ symbol: 'BTC_USDT' });
            if (marketData && marketData.history) {
                this.history = marketData.history;
            }

            this._log(this.isRunning ? "🚀 Núcleo IA Online" : "💤 Núcleo en Standby", 0.5);
            this._broadcastStatus();
        } catch (e) {
            console.error("Error en init de AIEngine:", e);
        }
    }

    async toggle(action, budget = null) {
        const targetState = (action === 'start');
        
        if (targetState) {
            // Actualización de presupuesto dinámico
            if (budget !== null && !isNaN(budget)) {
                this.virtualBalance = parseFloat(budget);
            }

            const marketData = await MarketSignal.findOne({ symbol: 'BTC_USDT' });
            if (marketData) this.history = marketData.history || [];
        } else {
            // Al detener, mantenemos el balance pero limpiamos el tracking de trade actual
            this.lastEntryPrice = 0;
            this.highestPrice = 0;
        }

        this.isRunning = targetState;
        
        // Persistencia en DB
        await Aibot.updateOne({}, { 
            isRunning: this.isRunning, 
            virtualBalance: this.virtualBalance,
            lastEntryPrice: this.lastEntryPrice,
            highestPrice: this.highestPrice,
            lastUpdate: new Date()
        });

        this._log(this.isRunning ? "🚀 NÚCLEO IA: ACTIVADO" : "🛑 NÚCLEO IA: DETENIDO", this.isRunning ? 1 : 0);
        this._broadcastStatus();
        return { isRunning: this.isRunning, virtualBalance: this.virtualBalance };
    }

    async analyze(price) {
        if (!this.isRunning) return;

        // 1. GESTIÓN DE SALIDA (Trailing Stop)
        if (this.lastEntryPrice > 0) {
            if (price > this.highestPrice) {
                this.highestPrice = price;
                // Guardado rápido en DB de la marca de precio más alta
                await Aibot.updateOne({}, { highestPrice: this.highestPrice });
            }

            const stopPrice = this.highestPrice * (1 - this.TRAILING_PERCENT);

            if (price <= stopPrice) {
                this._log(`🎯 Trailing Stop activado en $${price}`, 0.9);
                await this._trade('SELL', price, 1.0); 
                return; 
            }
        }

        // 2. OBTENER SEÑALES Y EJECUTAR
        const marketData = await MarketSignal.findOne({ symbol: 'BTC_USDT' }).lean();
        if (marketData && marketData.history) {
            this.history = marketData.history;
            await this._executeStrategy(price);
        }
    }

    async _executeStrategy(price) {
        // Necesitamos al menos 50 velas para indicadores como EMA50 o ADX
        if (this.history.length < 50) {
            this._log(`Sincronizando mercado... (${this.history.length}/50)`, 0.2, true);
            this._broadcastStatus(); 
            return;
        }

        const analysis = StrategyManager.calculate(this.history);
        if (!analysis) return;

        const { confidence, message } = analysis;
        
        if (this.lastEntryPrice === 0) {
            // Umbral de confianza para entrar (85%)
            if (confidence >= 0.85) {
                await this._trade('BUY', price, confidence);
            } else {
                // Log de baja confianza ocasional para feedback visual en el terminal
                if (Math.random() > 0.98) this._log(message || "Esperando señal clara...", confidence);
            }
        } else {
            // Monitoreo de posición activa
            if (Math.random() > 0.95) {
                const profit = ((price - this.lastEntryPrice) / this.lastEntryPrice * 100).toFixed(2);
                this._log(`Posición activa: ${profit}% | Stop en $${(this.highestPrice * (1 - this.TRAILING_PERCENT)).toFixed(2)}`, 1);
            }
        }
    }

    async _trade(side, price, confidence) {
        try {
            const amountInUSDT = this.virtualBalance * this.RISK_PER_TRADE;
            const fee = amountInUSDT * this.EXCHANGE_FEE;
            
            if (side === 'BUY') {
                this.lastEntryPrice = price;
                this.highestPrice = price;
                this.virtualBalance -= fee; // Pagamos comisión de entrada
                this._log(`🔥 ORDEN VIRTUAL: COMPRA BTC @ $${price}`, 1);
            } else {
                // Cálculo de profit neto real sobre la inversión
                const profitPct = (price - this.lastEntryPrice) / this.lastEntryPrice;
                const netProfit = (amountInUSDT * profitPct) - (fee * 2); // Fee de entrada + salida
                
                this.virtualBalance += netProfit;
                this._log(`💰 ORDEN VIRTUAL: VENTA BTC @ $${price} | Profit: $${netProfit.toFixed(2)}`, 1);
                
                this.lastEntryPrice = 0;
                this.highestPrice = 0;
            }

            // Registro en historial (MongoDB)
            await AIBotOrder.create({
                side, price, amount: amountInUSDT,
                isVirtual: true, confidenceScore: Math.round(confidence * 100),
                timestamp: new Date()
            });

            // Persistencia del estado financiero
            await Aibot.updateOne({}, { 
                virtualBalance: this.virtualBalance,
                lastEntryPrice: this.lastEntryPrice,
                highestPrice: this.highestPrice,
                lastUpdate: new Date()
            });

            // Notificación inmediata al Socket
            if (this.io) {
                this.io.emit('ai-order-executed', { 
                    side, 
                    price, 
                    balance: this.virtualBalance 
                });
                // Actualizamos el historial completo en el front
                const fullHistory = await AIBotOrder.find({ isVirtual: true }).sort({ timestamp: -1 }).limit(30);
                this.io.emit('ai-history-update', fullHistory);
            }

            this._broadcastStatus();
        } catch (error) {
            console.error("❌ Error en _trade IA:", error);
        }
    }

    _log(msg, conf, isAnalyzing = false) {
        if (this.io) {
            this.io.emit('ai-decision-update', { 
                confidence: conf, 
                message: msg, 
                isAnalyzing 
            });
        }
        console.log(`[IA-ENGINE] ${msg}`);
    }

    _broadcastStatus() {
        if (this.io) {
            this.io.emit('ai-status-update', {
                isRunning: this.isRunning,
                virtualBalance: this.virtualBalance,
                historyCount: this.history.length,
                lastEntryPrice: this.lastEntryPrice
            });
        }
    }
}

const engine = new AIEngine();
module.exports = engine;