/**
 * BSB/server/src/au/engines/AIEngine.js
 * AI Engine - Motor de Decisiones Neuronales (MODO SANDBOX SEGURO)
 */

const Order = require('../../models/Order'); 
const MarketSignal = require('../../models/MarketSignal'); 
const StrategyManager = require('./StrategyManager');

class AIEngine {
    constructor() {
        this.io = null;
        this.TRAILING_PERCENT = 0.005; // 0.5%
        this.EXCHANGE_FEE = 0.001;     // 0.1% (Simulamos comisión para realismo)
    }

    setIo(io) {
        this.io = io;
    }

    async analyze(price, userId, context) {
        if (!userId || !price || !context) return;

        try {
            const bot = context; 
            if (bot.aistate !== 'RUNNING') return;

            const lastEntryPrice = bot.ailastEntryPrice || 0;
            let highestPrice = bot.aihighestPrice || 0;

            // --- GESTIÓN DE POSICIÓN ABIERTA (TRAILING STOP SIMULADO) ---
            if (lastEntryPrice > 0) {
                if (price > highestPrice) {
                    highestPrice = price;
                    await context.updateAIStateData({ aihighestPrice: highestPrice });
                }

                const stopPrice = highestPrice * (1 - this.TRAILING_PERCENT);
                
                if (price <= stopPrice) {
                    this._log(userId, `🎯 AI: Trailing Stop activado. Salida @ $${price.toFixed(2)}`, 0.95);
                    await this._trade(userId, 'SELL', price, context);
                    return; 
                }
            }

            // --- BÚSQUEDA DE ENTRADAS ---
            if (lastEntryPrice === 0) {
                let SYMBOL = bot.config?.symbol || 'BTC_USDT';
                if (!SYMBOL.includes('_')) {
                    SYMBOL = SYMBOL.replace('USDT', '_USDT');
                }

                const marketData = await MarketSignal.findOne({ symbol: SYMBOL }).lean();
                const currentCount = marketData?.history?.length || 0;
                const REQUIRED_SAMPLES = 250; 

                if (!marketData || currentCount < REQUIRED_SAMPLES) {
                    this._log(userId, `Colectando datos: ${currentCount}/${REQUIRED_SAMPLES}...`, 0.01, true);
                    return;
                }

                this._log(userId, "AI Engine: Calculating Prediction...", 0.1, true);
                await this._executeStrategy(userId, price, marketData.history, context);
            }
        } catch (error) {
            console.error(`❌ AI Engine Error (User: ${userId}):`, error);
        }
    }

    async _executeStrategy(userId, price, history, context) {
        const analysis = StrategyManager.calculate(history);
        
        if (!analysis) {
            this._log(userId, "AI Engine: Waiting for indicators...", 0.01, true);
            return;
        }

        const { confidence, message } = analysis;
        
        if (confidence >= 0.75) {
            this._log(userId, `🚀 AI Signal: ${message} (${(confidence * 100).toFixed(0)}%). Buying...`, confidence);
            await this._trade(userId, 'BUY', price, context);
        } else {
            this._log(userId, `AI Watching: ${analysis.trend} (Conf: ${(confidence * 100).toFixed(0)}%)`, confidence, true);
        }
    }

    /**
     * MÉTODO BLINDADO: Solo base de datos, cero Bitmart.
     */
    async _trade(userId, side, price, context) {
        try {
            const bot = context;
            const currentBalance = parseFloat(bot.aibalance || 0);
            const investmentAmount = parseFloat(bot.config?.ai?.amountUsdt || 100);
            
            let newBalance = currentBalance;
            let nextEntryPrice = 0;
            let nextHighestPrice = 0;
            let netProfit = 0;

            // 1. CÁLCULO DE SIMULACIÓN MATEMÁTICA
            if (side === 'BUY') {
                // En compra virtual, el balance ya se inicializó con amountUsdt en el controller
                // pero si queremos descontar una "comisión" simulada:
                const fee = investmentAmount * this.EXCHANGE_FEE;
                nextEntryPrice = price;
                nextHighestPrice = price;
                newBalance = parseFloat((currentBalance - fee).toFixed(2));
            } else {
                // VENTA: Calculamos el profit comparando con el precio de entrada guardado
                const profitFactor = (price / bot.ailastEntryPrice);
                const fee = (currentBalance * profitFactor) * this.EXCHANGE_FEE;
                
                netProfit = (currentBalance * (profitFactor - 1)) - fee;
                newBalance = parseFloat((currentBalance + netProfit).toFixed(2));
                
                nextEntryPrice = 0;
                nextHighestPrice = 0;
            }

            const shouldStop = (side === 'SELL' && bot.config?.ai?.stopAtCycle);
            const newState = shouldStop ? 'STOPPED' : 'RUNNING';

            // 2. ACTUALIZACIÓN ATÓMICA EN DB (Sincronizado con el Orquestador)
            const changes = {
                aibalance: newBalance,
                ailastEntryPrice: nextEntryPrice,
                aihighestPrice: nextHighestPrice,
                aistate: newState,
                'config.ai.enabled': !shouldStop
            };

            await context.updateAIStateData(changes);
            
            if (side === 'SELL') {
                // Registramos el profit en el bot general solo como estadística
                await context.updateGeneralBotState({ 
                    $inc: { total_profit: parseFloat(netProfit.toFixed(4)) } 
                });
            }

            // 3. CREACIÓN DE LA ORDEN VIRTUAL
            // Esta es la orden que verá el frontend en la lista 'ai'
            await Order.create({
                userId,
                strategy: 'ai',
                executionMode: 'SIMULATED', 
                orderId: `v_ai_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                side,
                price,
                size: parseFloat((investmentAmount / price).toFixed(6)),
                notional: investmentAmount,
                status: 'FILLED',
                orderTime: new Date()
            });

            // 4. NOTIFICACIÓN POR SOCKET
            this._broadcastStatus(userId, {
                aistate: newState,
                virtualBalance: newBalance,
                lastEntryPrice: nextEntryPrice
            });

            context.log(`✅ AI ${side} Virtual Ejecutado @ $${price}`, 'success');

        } catch (error) {
            console.error("❌ Error en Trade Virtual de IA:", error);
            context.log(`❌ AI Virtual Error: ${error.message}`, 'error');
        }
    }

    _broadcastStatus(userId, data) {
        if (this.io) {
            this.io.to(userId.toString()).emit('ai-status-update', data);
        }
    }

    _log(userId, msg, conf, isAnalyzing = false) {
        if (this.io) {
            this.io.to(userId.toString()).emit('ai-decision-update', { 
                confidence: conf, 
                message: msg, 
                isAnalyzing 
            });
        }
    }
}

module.exports = new AIEngine();