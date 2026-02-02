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

        // PARÁMETROS DE GESTIÓN
        this.TRAILING_PERCENT = 0.005; // 0.5%
        this.RISK_PER_TRADE = 1.0;     // Usar el 100% del monto asignado para simular interés compuesto
        this.EXCHANGE_FEE = 0.001;     // 0.1% comisión estándar
    }

    setIo(io) { 
        this.io = io; 
        this.init(); 
    }

    async init() {
        try {
            let state = await Aibot.findOne({});
            if (!state) {
                state = await Aibot.create({ 
                    virtualBalance: 100.00, 
                    amountUsdt: 100.00,
                    isRunning: false 
                });
            }

            this.isRunning = state.isRunning;
            this.amountUsdt = state.amountUsdt || 100.00;
            
            // Priorizamos el balance acumulado, si es 0 usamos el monto inicial
            this.virtualBalance = (state.virtualBalance > 0) ? state.virtualBalance : this.amountUsdt;

            this.lastEntryPrice = state.lastEntryPrice || 0;
            this.highestPrice = state.highestPrice || 0;

            this._broadcastStatus();
            this._log(this.isRunning ? "🚀 Núcleo IA Online" : "💤 Núcleo en Standby", 0.5);
        } catch (e) {
            console.error("Error en init de AIEngine:", e);
        }
    }

    async toggle(action) {
        const targetState = (action === 'start');
        
        // Cargar datos frescos de la DB antes de arrancar
        const state = await Aibot.findOne({});
        if (state) {
            this.amountUsdt = state.amountUsdt;
            if (!this.isRunning && targetState) {
                // Si estaba apagado y encendemos, refrescamos balance desde DB
                this.virtualBalance = state.virtualBalance || state.amountUsdt;
            }
        }

        this.isRunning = targetState;
        
        if (!this.isRunning) {
            // No reseteamos lastEntryPrice aquí para permitir que una posición 
            // abierta siga su curso si el usuario apaga pero el proceso sigue vivo
            // (Opcional según prefieras)
        }
        
        await Aibot.updateOne({}, { isRunning: this.isRunning });

        this._broadcastStatus();
        this._log(this.isRunning ? "🚀 NÚCLEO IA: ACTIVADO" : "🛑 NÚCLEO IA: DETENIDO", this.isRunning ? 0.9 : 0);
        return { isRunning: this.isRunning, virtualBalance: this.virtualBalance };
    }

    async analyze(price) {
        if (!this.isRunning) return;

        // 1. GESTIÓN DE SALIDA (Trailing Stop)
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

        // 2. PROCESAR ESTRATEGIA
        const marketData = await MarketSignal.findOne({ symbol: 'BTC_USDT' }).lean();
        if (marketData && marketData.history) {
            this.history = marketData.history;
            await this._executeStrategy(price);
        }
    }

    async _executeStrategy(price) {
        // Necesitamos al menos 50 velas para indicadores técnicos estables
        if (this.history.length < 50) {
            this._broadcastStatus(); // Para actualizar el counter (X/50) en el botón
            return;
        }

        const analysis = StrategyManager.calculate(this.history);
        if (!analysis) return;

        const { confidence, message } = analysis;
        
        // Si no hay posición, buscar compra
        if (this.lastEntryPrice === 0) {
            if (confidence >= 0.85) {
                await this._trade('BUY', price, confidence);
            } else {
                // Log cada cierto tiempo para no saturar
                if (Math.random() > 0.98) this._log(message, confidence);
            }
        } else {
            // Monitor de profit actual
            const profit = ((price - this.lastEntryPrice) / this.lastEntryPrice * 100).toFixed(2);
            if (Math.random() > 0.95) {
                this._log(`Holding: ${profit}% | Trail-Stop: $${(this.highestPrice * (1 - this.TRAILING_PERCENT)).toFixed(2)}`, confidence);
            }
        }
    }

    async _trade(side, price, confidence) {
        try {
            // Usamos el virtualBalance total para la operación (Interés Compuesto)
            const tradeAmountUSDT = this.virtualBalance;
            const fee = tradeAmountUSDT * this.EXCHANGE_FEE;
            
            if (side === 'BUY') {
                this.lastEntryPrice = price;
                this.highestPrice = price;
                this.virtualBalance -= fee; // Descontar comisión de entrada
                this._log(`🔥 COMPRA VIRTUAL: BTC @ $${price}`, 1);
            } else {
                const profitPct = (price - this.lastEntryPrice) / this.lastEntryPrice;
                const netProfit = (tradeAmountUSDT * profitPct) - (fee); // Fee de salida
                
                this.virtualBalance += netProfit;
                this._log(`💰 VENTA VIRTUAL: BTC @ $${price} | PNL: $${netProfit.toFixed(2)} USDT`, 1);
                
                this.lastEntryPrice = 0;
                this.highestPrice = 0;
            }

            // Sincronizar con DB
            await Aibot.updateOne({}, { 
                virtualBalance: this.virtualBalance,
                lastEntryPrice: this.lastEntryPrice,
                highestPrice: this.highestPrice
            });

            // Registrar en historial
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
                lastEntryPrice: this.lastEntryPrice
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