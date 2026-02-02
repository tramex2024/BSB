/**
 * Archivo: server/src/ai/AIEngine.js
 * Núcleo de Inteligencia Artificial - Modo Virtual (Sincronizado 2026)
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
        this.virtualBalance = 0; 
        this.amountUsdt = 0;      
        this.lastEntryPrice = 0;
        this.highestPrice = 0;
        this.stopAtCycle = false;

        // PARÁMETROS DE GESTIÓN
        this.TRAILING_PERCENT = 0.005; // 0.5%
        this.RISK_PER_TRADE = 1.0;     // 100% del monto (Interés compuesto)
        this.EXCHANGE_FEE = 0.001;     // 0.1% comisión simulación
    }

    setIo(io) { 
        this.io = io; 
        this.init(); 
    }

    /**
     * Inicialización: Carga el estado persistente desde MongoDB
     */
    async init() {
        try {
            let state = await Aibot.findOne({});
            if (!state) {
                state = await Aibot.create({ 
                    virtualBalance: 100.00, 
                    amountUsdt: 100.00,
                    isRunning: false,
                    stopAtCycle: false
                });
            }

            this.isRunning = state.isRunning;
            this.amountUsdt = state.amountUsdt || 100.00;
            this.virtualBalance = (state.virtualBalance > 0) ? state.virtualBalance : this.amountUsdt;
            this.lastEntryPrice = state.lastEntryPrice || 0;
            this.highestPrice = state.highestPrice || 0;
            this.stopAtCycle = state.stopAtCycle || false;

            this._broadcastStatus();
            this._log(this.isRunning ? "🚀 Núcleo IA Online" : "💤 Núcleo en Standby", 0.5);
        } catch (e) {
            console.error("❌ Error en init de AIEngine:", e);
        }
    }

    /**
     * Control Maestro: Encendido y Apagado
     */
    async toggle(action) {
        const targetState = (action === 'start');
        const state = await Aibot.findOne({});
        
        if (state) {
            this.amountUsdt = state.amountUsdt;
            this.stopAtCycle = state.stopAtCycle;
            if (!this.isRunning && targetState) {
                this.virtualBalance = state.virtualBalance || state.amountUsdt;
            }
        }

        this.isRunning = targetState;
        await Aibot.updateOne({}, { isRunning: this.isRunning });

        this._broadcastStatus();
        this._log(this.isRunning ? "🚀 NÚCLEO IA: ACTIVADO" : "🛑 NÚCLEO IA: DETENIDO", this.isRunning ? 0.9 : 0);
        return { isRunning: this.isRunning, virtualBalance: this.virtualBalance };
    }

    /**
     * Ciclo de Vida: Analiza cada tick de precio recibido
     */
    async analyze(price) {
        if (!this.isRunning) return;

        // 1. GESTIÓN DE SALIDA (Trailing Stop Dinámico)
        if (this.lastEntryPrice > 0) {
            if (price > this.highestPrice) {
                this.highestPrice = price;
            }

            const stopPrice = this.highestPrice * (1 - this.TRAILING_PERCENT);

            if (price <= stopPrice) {
                this._log(`🎯 Trailing Stop activado en $${price}`, 0.95);
                await this._trade('SELL', price, 1.0);
                return; 
            }
        }

        // 2. PROCESAR ESTRATEGIA NEURAL
        const marketData = await MarketSignal.findOne({ symbol: 'BTC_USDT' }).lean();
        if (marketData && marketData.history) {
            this.history = marketData.history;
            await this._executeStrategy(price);
        }
    }

    async _executeStrategy(price) {
        if (this.history.length < 50) {
            this._broadcastStatus();
            return;
        }

        const analysis = StrategyManager.calculate(this.history);
        if (!analysis) return;

        const { confidence, message } = analysis;
        
        if (this.lastEntryPrice === 0) {
            if (confidence >= 0.85) {
                await this._trade('BUY', price, confidence);
            } else {
                if (Math.random() > 0.98) this._log(message, confidence);
            }
        } else {
            const profit = ((price - this.lastEntryPrice) / this.lastEntryPrice * 100).toFixed(2);
            if (Math.random() > 0.95) {
                this._log(`Holding: ${profit}% | Trail-Stop: $${(this.highestPrice * (1 - this.TRAILING_PERCENT)).toFixed(2)}`, confidence);
            }
        }
    }

    /**
     * Venta de Emergencia: Cierra todo y apaga el motor
     */
    async panicSell() {
        try {
            if (this.lastEntryPrice === 0) {
                this.isRunning = false;
                await Aibot.updateOne({}, { isRunning: false });
                this._broadcastStatus();
                return { success: true, message: "IA Detenida (Sin posiciones)" };
            }

            const currentPrice = this.history.length > 0 ? this.history[this.history.length - 1].close : 0;
            this._log("🚨 PANIC SELL: Liquidando posición inmediatamente...", 1);
            
            await this._trade('SELL', currentPrice, 0);
            
            this.isRunning = false;
            await Aibot.updateOne({}, { isRunning: false });
            this._broadcastStatus();
            
            return { success: true, message: "Posición cerrada y motor en Standby" };
        } catch (error) {
            console.error("❌ Error en Panic Sell:", error);
            throw error;
        }
    }

    /**
     * Ejecutor de Órdenes Virtuales
     */
    async _trade(side, price, confidence) {
        try {
            const tradeAmountUSDT = this.virtualBalance;
            const fee = tradeAmountUSDT * this.EXCHANGE_FEE;
            
            if (side === 'BUY') {
                this.lastEntryPrice = price;
                this.highestPrice = price;
                this.virtualBalance -= fee;
                this._log(`🔥 COMPRA VIRTUAL: BTC @ $${price}`, 1);
            } else {
                const profitPct = (price - this.lastEntryPrice) / this.lastEntryPrice;
                const netProfit = (tradeAmountUSDT * profitPct) - (fee); 
                
                this.virtualBalance += netProfit;
                this._log(`💰 VENTA VIRTUAL: BTC @ $${price} | PNL: $${netProfit.toFixed(2)} USDT`, 1);
                
                this.lastEntryPrice = 0;
                this.highestPrice = 0;

                if (this.stopAtCycle) {
                    this.isRunning = false;
                    this.stopAtCycle = false;
                    this._log("🛑 CICLO COMPLETADO: Auto-apagado activado.", 0.5);
                }
            }

            await Aibot.updateOne({}, { 
                virtualBalance: this.virtualBalance,
                lastEntryPrice: this.lastEntryPrice,
                highestPrice: this.highestPrice,
                isRunning: this.isRunning,
                stopAtCycle: this.stopAtCycle
            });

            await AIBotOrder.create({
                side, price, amount: tradeAmountUSDT,
                isVirtual: true, confidenceScore: Math.round(confidence * 100),
                timestamp: new Date()
            });

            this._broadcastStatus();
        } catch (error) {
            console.error("❌ Error en trade IA:", error);
        }
    }

    _broadcastStatus() {
        if (this.io) {
            this.io.emit('ai-status-update', {
                isRunning: this.isRunning,
                virtualBalance: parseFloat(this.virtualBalance || 0),
                amountUsdt: this.amountUsdt,
                historyCount: this.history.length,
                lastEntryPrice: this.lastEntryPrice,
                stopAtCycle: this.stopAtCycle
            });
        }
    }

    _log(msg, conf, isAnalyzing = false) {
        if (this.io) {
            this.io.emit('ai-decision-update', { confidence: conf, message: msg, isAnalyzing });
        }
    }
}

const engine = new AIEngine();
module.exports = engine;