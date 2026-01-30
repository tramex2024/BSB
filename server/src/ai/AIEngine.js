/**
 * Archivo: server/src/ai/AIEngine.js
 * Núcleo de Inteligencia Artificial - Modo Virtual (Optimizado)
 */

const Aibot = require('../../models/Aibot');
const AIBotOrder = require('../../models/AIBotOrder');
const MarketSignal = require('../../models/MarketSignal'); // NUEVO: Nuestra fuente de verdad
const StrategyManager = require('./StrategyManager');

class AIEngine {
    constructor() {
        this.isRunning = false;
        this.io = null;
        this.history = [];
        this.virtualBalance = 100.00;
        this.lastEntryPrice = 0;
        this.highestPrice = 0;

        // PARÁMETROS
        this.TRAILING_PERCENT = 0.003; 
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

            // 🚀 CARGA DE CONTEXTO INICIAL DESDE LA DB CENTRAL
            const marketData = await MarketSignal.findOne({ symbol: 'BTC_USDT' });
            if (marketData && marketData.history) {
                this.history = marketData.history;
                this._log(`Contexto recuperado: ${this.history.length} velas disponibles.`, 0.5);
            }

            this._log(this.isRunning ? "🚀 Núcleo IA Online" : "💤 Núcleo en Standby", 0.5);
        } catch (e) {
            console.error("Error en init de AIEngine:", e);
        }
    }

    async toggle(action) {
        this.isRunning = (action === 'start');
        
        // Si arrancamos, forzamos refresco de historial
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

        // 1. Gestión de Trailing Stop (Prioridad máxima)
        if (this.lastEntryPrice > 0) {
            if (price > this.highestPrice) this.highestPrice = price;
            const stopPrice = this.highestPrice * (1 - this.TRAILING_PERCENT);
            
            if (price <= stopPrice) {
                await this._trade('SELL', price, 0.95);
                return; 
            }
        }

        // 2. Sincronización con CentralAnalyzer
        // Obtenemos el historial ya procesado por el backend central
        const marketData = await MarketSignal.findOne({ symbol: 'BTC_USDT' }).lean();
        
        if (marketData && marketData.history && marketData.history.length > 0) {
            this.history = marketData.history;
            
            // Ejecutamos estrategia con el historial actualizado
            await this._executeStrategy(price);
        }
    }

    async _executeStrategy(price) {
        // Ahora currentProgress rara vez será menor a 30 gracias al CentralAnalyzer
        const currentProgress = this.history.length;
        
        if (currentProgress < 20) { // Bajamos el umbral mínimo para ser más ágiles
            this._log(`Sincronizando... (${currentProgress}/20)`, 0.2, true);
            return;
        }

        const analysis = StrategyManager.calculate(this.history);
        
        if (!analysis || analysis.rsi === undefined) return;

        const { rsi, adx, trend, confidence } = analysis;
        
        if (this.lastEntryPrice === 0) {
            // Lógica de Compra
            if (confidence >= 0.7) { // Umbral de confianza
                await this._trade('BUY', price, confidence);
            } else {
                // Log de pensamiento para el dashboard
                const pensamiento = `RSI:${rsi.toFixed(1)} | ADX:${adx.toFixed(1)} | Conf:${(confidence*100).toFixed(0)}%`;
                this._log(pensamiento, confidence);
            }
        } else {
            // Monitoreo de posición abierta
            const profit = ((price - this.lastEntryPrice) / this.lastEntryPrice * 100).toFixed(2);
            this._log(`Profit: ${profit}% | Trailing Stop activo`, 0.9);
        }
    }

    async _trade(side, price, confidence) {
        try {
            const amountInUSDT = this.virtualBalance * this.RISK_PER_TRADE;
            const fee = amountInUSDT * this.EXCHANGE_FEE;
            
            if (side === 'BUY') {
                this.lastEntryPrice = price;
                this.highestPrice = price;
                this.virtualBalance -= fee;
                this._log(`🔥 COMPRA VIRTUAL: $${price} (Confianza: ${Math.round(confidence * 100)}%)`, 1);
            } else {
                const profitPct = (price - this.lastEntryPrice) / this.lastEntryPrice;
                const profitAmount = (amountInUSDT * profitPct) - fee;
                this.virtualBalance += profitAmount;
                this.lastEntryPrice = 0;
                this.highestPrice = 0;
                this._log(`💰 VENTA VIRTUAL (Exit): $${price} | Resultado: ${profitAmount.toFixed(2)} USDT`, 0.5);
            }

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
        const timestamp = new Date().toLocaleTimeString();
        
        // 1. Log unificado para Render (Visibilidad en servidor)
        console.log(`[${timestamp}] [INFO] [AI-VIRTUAL] 🧠 ${msg}`);

        // 2. Envío al Dashboard (Socket)
        if (this.io) {
            this.io.emit('ai-decision-update', { 
                confidence: conf, 
                message: msg, 
                isAnalyzing: isAnalyzing 
            });
            this._broadcastStatus();
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