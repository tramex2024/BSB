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
        this.TRAILING_PERCENT = 0.005; 
        this.RISK_PER_TRADE = 0.10; // Usará el 10% del presupuesto asignado por trade
        this.EXCHANGE_FEE = 0.001;     
    }

    setIo(io) { 
        this.io = io; 
        this.init(); 
    }

    async init() {
        try {
            let state = await Aibot.findOne({});
            if (!state) state = await Aibot.create({ virtualBalance: 10000.00 });

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

    // MODIFICADO: Ahora acepta 'budget' para actualizar el capital al arrancar
    async toggle(action, budget = null) {
        const targetState = (action === 'start');
        
        if (targetState) {
            // Si recibimos un presupuesto nuevo, lo aplicamos
            if (budget !== null && !isNaN(budget)) {
                this.virtualBalance = parseFloat(budget);
                this._log(`💰 Capital inicializado en $${this.virtualBalance}`, 0.5);
            }

            const marketData = await MarketSignal.findOne({ symbol: 'BTC_USDT' });
            if (marketData) this.history = marketData.history || [];
        } else {
            // Si apagamos con posición abierta, reseteamos precios de control
            if (this.lastEntryPrice > 0) {
                this._log("⚠️ Apagado detectado con posición abierta.", 0.9);
            }
            this.lastEntryPrice = 0;
            this.highestPrice = 0;
        }

        this.isRunning = targetState;
        
        // Persistencia total en DB
        await Aibot.updateOne({}, { 
            isRunning: this.isRunning, 
            virtualBalance: this.virtualBalance, // Guardamos el nuevo balance
            lastEntryPrice: this.lastEntryPrice,
            highestPrice: this.highestPrice,
            lastUpdate: new Date()
        });

        this._broadcastStatus();
        this._log(this.isRunning ? "🚀 NÚCLEO IA: ONLINE" : "🛑 NÚCLEO IA: OFFLINE", this.isRunning ? 1 : 0);
        return { isRunning: this.isRunning, virtualBalance: this.virtualBalance };
    }

    async analyze(price) {
        if (!this.isRunning) return;

        // 1. GESTIÓN DE SALIDA (Trailing Stop Dinámico)
        if (this.lastEntryPrice > 0) {
            if (price > this.highestPrice) {
                this.highestPrice = price;
                Aibot.updateOne({}, { highestPrice: this.highestPrice }).catch(()=>{});
            }

            const stopPrice = this.highestPrice * (1 - this.TRAILING_PERCENT);

            if (price <= stopPrice) {
                this._log(`🎯 Trailing Stop activado en $${price}`, 0.9);
                await this._trade('SELL', price, 1.0); 
                return; 
            }
        }

        // 2. OBTENER SEÑALES
        const marketData = await MarketSignal.findOne({ symbol: 'BTC_USDT' }).lean();
        if (marketData && marketData.history) {
            this.history = marketData.history;
            await this._executeStrategy(price);
        }
    }

    async _executeStrategy(price) {
        if (this.history.length < 50) {
            this._log(`Sincronizando mercado... (${this.history.length}/50)`, 0.2, true);
            this._broadcastStatus(); 
            return;
        }

        const analysis = StrategyManager.calculate(this.history);
        if (!analysis || analysis.confidence === undefined) return;

        const { confidence, message } = analysis;
        
        if (this.lastEntryPrice === 0) {
            if (confidence >= 0.85) {
                await this._trade('BUY', price, confidence);
            } else if (Math.random() > 0.98) {
                this._log(message || "Buscando entrada...", confidence);
            }
        } else {
            if (Math.random() > 0.95) {
                const profit = ((price - this.lastEntryPrice) / this.lastEntryPrice * 100).toFixed(2);
                this._log(`Posición activa: ${profit}% | Stop: $${(this.highestPrice * (1 - this.TRAILING_PERCENT)).toFixed(2)}`, 1);
                this._broadcastStatus(); 
            }
        }
    }

    async _trade(side, price, confidence) {
        try {
            // El monto de la operación es el 10% del balance virtual actual
            const amountInUSDT = this.virtualBalance * this.RISK_PER_TRADE;
            const fee = amountInUSDT * this.EXCHANGE_FEE;
            
            if (side === 'BUY') {
                this.lastEntryPrice = price;
                this.highestPrice = price;
                this.virtualBalance -= fee; 
                this._log(`🔥 COMPRA VIRTUAL: BTC @ $${price}`, 1);
            } else {
                const profitPct = (price - this.lastEntryPrice) / this.lastEntryPrice;
                // Calculamos sobre el monto que pusimos en riesgo
                const netProfit = (amountInUSDT * profitPct) - (fee * 2); 
                
                this.virtualBalance += netProfit;
                this._log(`💰 VENTA VIRTUAL: BTC @ $${price} | Resultado: ${netProfit.toFixed(4)} USDT`, 1);
                
                this.lastEntryPrice = 0;
                this.highestPrice = 0;
            }

            await AIBotOrder.create({
                side, price, amount: amountInUSDT,
                isVirtual: true, confidenceScore: Math.round(confidence * 100),
                timestamp: new Date()
            });

            await Aibot.updateOne({}, { 
                virtualBalance: this.virtualBalance,
                lastEntryPrice: this.lastEntryPrice,
                highestPrice: this.highestPrice,
                lastUpdate: new Date()
            });

            if (this.io) {
                this.io.emit('ai-order-executed', { 
                    side, 
                    price, 
                    balance: this.virtualBalance,
                    profit: side === 'SELL' ? (price - this.lastEntryPrice) : 0 
                });
            }

            this._broadcastStatus();
        } catch (error) {
            console.error("❌ Error en ejecución de Trade IA:", error);
        }
    }

    _log(msg, conf, isAnalyzing = false) {
        if (this.io) {
            this.io.emit('ai-decision-update', { confidence: conf, message: msg, isAnalyzing });
        }
        console.log(`[IA-ENGINE] ${msg}`);
    }

    _broadcastStatus() {
        if (this.io) {
            this.io.emit('ai-status-update', {
                isRunning: this.isRunning,
                virtualBalance: this.virtualBalance,
                historyCount: this.history.length,
                lastEntryPrice: this.lastEntryPrice,
                highestPrice: this.highestPrice
            });
        }
    }
}

const engine = new AIEngine();
module.exports = engine;