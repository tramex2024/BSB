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
        this.virtualBalance = 10000.00; // Iniciamos con un valor por defecto realista
        this.lastEntryPrice = 0;
        this.highestPrice = 0;

        // PARÁMETROS DE GESTIÓN (0.5% trailing es ideal para BTC en 1m)
        this.TRAILING_PERCENT = 0.005; 
        this.RISK_PER_TRADE = 0.10; // Usar el 10% del balance por trade
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

    async toggle(action) {
        const targetState = (action === 'start');
        
        // Si vamos a apagar y hay una posición abierta, cerramos sesión virtualmente
        if (!targetState && this.lastEntryPrice > 0) {
            this._log("⚠️ Apagado detectado con posición abierta. Liquidando...", 0.9);
            // Podrías llamar a this._trade('SELL', precioActual, 1.0) aquí si tienes el precio
        }

        this.isRunning = targetState;
        
        if (this.isRunning) {
            const marketData = await MarketSignal.findOne({ symbol: 'BTC_USDT' });
            if (marketData) this.history = marketData.history || [];
        } else {
            // Limpieza de estados de sesión al detener
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
            // Actualizar el pico máximo alcanzado desde la compra
            if (price > this.highestPrice) {
                this.highestPrice = price;
                // Opcional: Persistir el nuevo pico para evitar pérdidas en reinicios
                Aibot.updateOne({}, { highestPrice: this.highestPrice }).catch(()=>{});
            }

            const stopPrice = this.highestPrice * (1 - this.TRAILING_PERCENT);

            // Si el precio cae por debajo del stop dinámico
            if (price <= stopPrice) {
                this._log(`🎯 Trailing Stop activado en $${price}`, 0.9);
                await this._trade('SELL', price, 1.0); // Confianza máxima en la salida
                return; 
            }
        }

        // 2. OBTENER SEÑALES (Contexto de mercado)
        const marketData = await MarketSignal.findOne({ symbol: 'BTC_USDT' }).lean();
        if (marketData && marketData.history) {
            this.history = marketData.history;
            await this._executeStrategy(price);
        }
    }

    async _executeStrategy(price) {
        // AJUSTE: Ahora requerimos 50 para EMA 50 del StrategyManager
        if (this.history.length < 50) {
            this._log(`Sincronizando mercado... (${this.history.length}/50)`, 0.2, true);
            this._broadcastStatus(); 
            return;
        }

        const analysis = StrategyManager.calculate(this.history);
        if (!analysis || analysis.confidence === undefined) return;

        const { confidence, message } = analysis;
        
        // Entrada en posición USDT -> BTC
        if (this.lastEntryPrice === 0) {
            if (confidence >= 0.85) {
                await this._trade('BUY', price, confidence);
            } else if (Math.random() > 0.98) { // Reducido frecuencia de logs de análisis
                this._log(message || "Buscando entrada...", confidence);
            }
        } else {
            // Monitoreo de posición abierta (Profit latente)
            if (Math.random() > 0.95) {
                const profit = ((price - this.lastEntryPrice) / this.lastEntryPrice * 100).toFixed(2);
                this._log(`Posición activa: ${profit}% | Stop en: $${(this.highestPrice * (1 - this.TRAILING_PERCENT)).toFixed(2)}`, 1);
                this._broadcastStatus(); 
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
                this.virtualBalance -= fee; // Descontamos comisión de entrada
                this._log(`🔥 COMPRA VIRTUAL: BTC @ $${price}`, 1);
            } else {
                const profitPct = (price - this.lastEntryPrice) / this.lastEntryPrice;
                const netProfit = (amountInUSDT * profitPct) - (fee * 2); // Entrada + Salida
                
                this.virtualBalance += netProfit;
                this._log(`💰 VENTA VIRTUAL: BTC @ $${price} | Resultado: ${netProfit.toFixed(4)} USDT`, 1);
                
                this.lastEntryPrice = 0;
                this.highestPrice = 0;
            }

            // Guardar orden en historial
            await AIBotOrder.create({
                side, price, amount: amountInUSDT,
                isVirtual: true, confidenceScore: Math.round(confidence * 100),
                timestamp: new Date()
            });

            // Persistencia del estado global de la IA
            await Aibot.updateOne({}, { 
                virtualBalance: this.virtualBalance,
                lastEntryPrice: this.lastEntryPrice,
                highestPrice: this.highestPrice,
                lastUpdate: new Date()
            });

            // Notificar al Frontend (Toast y Sonido)
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