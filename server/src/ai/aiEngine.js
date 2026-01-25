const Autobot = require('../../models/Autobot');
const AIBotOrder = require('../../models/AIBotOrder');
const StrategyManager = require('./StrategyManager');
const CandleBuilder = require('./CandleBuilder');

class AIEngine {
    constructor() {
        this.isRunning = false;
        this.io = null;
        this.IS_VIRTUAL_MODE = true; 

        this.history = [];
        this.tradeLog = [];
        this.virtualBalance = 100.00; // Valor inicial por defecto
        this.lastEntryPrice = 0;
        this.highestPrice = 0;

        // PARÁMETROS PROFESIONALES
        this.TRAILING_PERCENT = 0.003; // 0.3%
        this.RISK_PER_TRADE = 0.10;    
        this.PANIC_STOP_BALANCE = 20.00; 
        this.MIN_TRADE_AMOUNT = 6.00;
        this.EXCHANGE_FEE = 0.001; // 0.1% comisión (Maker/Taker promedio)
    }

    setIo(io) { 
        this.io = io; 
        this.init(); 
    }

    async init() {
        try {
            // ✅ MEJORA: Persistencia. Intentamos recuperar el balance previo en lugar de resetear siempre.
            const bot = await Autobot.findOne({});
            if (bot && bot.virtualAiBalance > 0) {
                this.virtualBalance = bot.virtualAiBalance;
                this._log(`Sistema Recuperado: Balance actual $${this.virtualBalance.toFixed(2)}`, 0.5);
            } else {
                // Si no existe el campo, lo inicializamos
                await Autobot.updateOne({}, { $set: { virtualAiBalance: 100.00 } });
                this.virtualBalance = 100.00;
                this._log(`Sistema Inicializado: Balance $100.00`, 0.5);
            }
        } catch (e) {
            console.error("Error en init de AIEngine:", e);
        }
    }

    toggle(action) {
        this.isRunning = (action === 'start');
        this._log(this.isRunning ? "🚀 NÚCLEO IA: ONLINE" : "🛑 NÚCLEO IA: OFFLINE", this.isRunning ? 1 : 0);
        return { isRunning: this.isRunning, virtualBalance: this.virtualBalance };
    }

    async analyze(price) {
        if (!this.isRunning) return;

        // Verificación de seguridad de balance
        if (this.IS_VIRTUAL_MODE && this.virtualBalance <= this.PANIC_STOP_BALANCE) {
            this.isRunning = false;
            this._log("🚨 PÁNICO: Saldo por debajo del límite de seguridad.", 0);
            return;
        }

        // --- LÓGICA DE SALIDA (TRAILING STOP) ---
        if (this.lastEntryPrice > 0) {
            if (price > this.highestPrice) this.highestPrice = price;
            const stopPrice = this.highestPrice * (1 - this.TRAILING_PERCENT);
            
            if (price <= stopPrice) {
                this._log(`🎯 Trailing Stop activado a ${price.toFixed(2)}`, 0.9);
                await this._trade('SELL', price, 0.95);
                return; 
            }
        }

        const closedCandle = CandleBuilder.processTick(price);
        if (closedCandle) {
            this.history.push(closedCandle);
            if (this.history.length > 50) this.history.shift();
            await this._executeStrategy(price);
        }
    }

    async _executeStrategy(price) {
        // 1. Verificación de memoria técnica (mínimo 28-30 velas para EMAs y ADX)
        if (this.history.length < 30) {
            this._log(`Analizando mercado... (${this.history.length}/30)`, 0.2);
            return;
        }

        // 2. Obtener análisis del StrategyManager
        const analysis = StrategyManager.calculate(this.history);
        
        // Verificación de seguridad de datos
        if (!analysis || !analysis.adx || !analysis.stoch) return;

        const { adx, stoch, isBullish, isHighVolume } = analysis;
        
        /**
         * 🔥 ESTRATEGIA REFORZADA 2026
         * - adx.adx > 25: Hay una tendencia clara.
         * - isBullish: La tendencia es alcista (EMA 9 > EMA 21).
         * - stoch.stochK < 30: El precio está en una zona de "descuento" (Sobreventa).
         * - isHighVolume: Hay confirmación de los inversores (Volumen > Promedio).
         */
        const buySignal = adx.adx > 25 && 
                          isBullish && 
                          stoch.stochK < 30 && 
                          isHighVolume;

        // 3. LÓGICA DE ENTRADA (BUY)
        if (buySignal && this.lastEntryPrice === 0) {
            // Calculamos confianza basada en la fuerza del ADX y el Volumen
            const confidence = Math.min((adx.adx / 50) * (isHighVolume ? 1.2 : 1), 1);
            
            this._log(`🎯 SEÑAL CONFIRMADA: Tendencia Fuerte + Volumen Alto.`, confidence);
            await this._trade('BUY', price, confidence);
        } 
        
        // 4. LÓGICA DE SALIDA POR CAMBIO DE TENDENCIA (SELL)
        // Si no ha salido por Trailing Stop, salimos si la tendencia se invierte
        else if (this.lastEntryPrice > 0) {
            const sellSignal = adx.mdi > adx.pdi || !isBullish;

            if (sellSignal) {
                this._log(`⚠️ Saliendo por cambio de estructura/tendencia.`, 0.8);
                await this._trade('SELL', price, 0.85);
            }
        }
    }

    async _trade(side, price, conf) {
        try {
            let amount = this.virtualBalance * this.RISK_PER_TRADE;
            if (amount < this.MIN_TRADE_AMOUNT) amount = this.MIN_TRADE_AMOUNT;

            let pnlLast = 0;
            const feeCost = amount * this.EXCHANGE_FEE;

            if (side === 'BUY') {
                this.lastEntryPrice = price;
                this.highestPrice = price;
                // ✅ MEJORA: Restamos comisión al comprar para realismo total
                this.virtualBalance -= (amount + feeCost);
            } else {
                const perf = (price / this.lastEntryPrice) - 1;
                // ✅ MEJORA: El PnL neto considera ambas comisiones (compra y venta)
                pnlLast = (amount * perf) - feeCost; 
                this.virtualBalance += (amount + pnlLast);
                
                this.tradeLog.push({ profit: pnlLast, date: new Date() });
                this.lastEntryPrice = 0;
                this.highestPrice = 0;
            }

            // Persistencia en DB
            await Autobot.updateOne({}, { $set: { virtualAiBalance: this.virtualBalance } });

            // Guardar orden en historial
            const newOrder = new AIBotOrder({ 
                symbol: 'BTC_USDT', side, price, amount, isVirtual: true, confidenceScore: (conf * 100).toFixed(2) 
            });
            await newOrder.save();

            if (this.io) {
                this.io.emit('ai-order-executed', { 
                    side,
                    price: price.toFixed(2),
                    currentVirtualBalance: this.virtualBalance.toFixed(2),
                    pnlLastTrade: pnlLast.toFixed(2)
                });
            }
            this._log(`IA ${side} Virtual ejecutada (Conf: ${(conf*100).toFixed(0)}%)`, conf);
        } catch (e) {
            console.error("Error en ejecución de trade IA:", e);
        }
    }

    _log(msg, conf) {
        if (this.io) {
            this.io.emit('ai-decision-update', { confidence: conf, message: msg });
        }
        console.log(`[AI-ENGINE] ${msg}`);
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            virtualBalance: this.virtualBalance,
            config: { risk: this.RISK_PER_TRADE, trailing: this.TRAILING_PERCENT }
        };
    }
}

const engine = new AIEngine();
module.exports = engine;