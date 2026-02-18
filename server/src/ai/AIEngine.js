/**
 * BSB/server/src/au/engines/AIEngine.js
 * AI Engine - Motor de Decisiones Neuronales (Integrado con Orquestador 2026)
 */

const Order = require('../../models/Order'); 
const MarketSignal = require('../../models/MarketSignal'); 
const StrategyManager = require('./StrategyManager');

class AIEngine {
    constructor() {
        this.io = null;
        this.TRAILING_PERCENT = 0.005; // 0.5%
        this.EXCHANGE_FEE = 0.001;     // 0.1%
    }

    setIo(io) {
        this.io = io;
    }

    /**
     * @param {number} price - Precio actual de mercado
     * @param {string} userId - ID del usuario
     * @param {object} context - Inyectado desde aiStrategy (contiene botState, placeAIOrder, etc.)
     */
    async analyze(price, userId, context) {
        if (!userId || !price || !context) return;

        try {
            // Usamos el botState que ya viene del orquestador (fresco de la DB)
            const bot = context; 
            if (bot.aistate !== 'RUNNING') return;

            const lastEntryPrice = bot.ailastEntryPrice || 0;
            let highestPrice = bot.aihighestPrice || 0;

            // --- GESTIÓN DE POSICIÓN ABIERTA (TRAILING STOP) ---
            if (lastEntryPrice > 0) {
                if (price > highestPrice) {
                    highestPrice = price;
                    // Actualizamos vía orquestador, no directo a DB
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

    async _trade(userId, side, price, context) {
        try {
            const bot = context;
            const currentBalance = parseFloat(bot.aibalance || bot.config?.ai?.amountUsdt || 100);
            const fee = currentBalance * this.EXCHANGE_FEE;
            
            let newBalance = currentBalance;
            let nextEntryPrice = 0;
            let nextHighestPrice = 0;
            let netProfit = 0;

            // 1. EJECUCIÓN DE ORDEN REAL/SIMULADA EN EL EXCHANGE
            // Usamos placeAIOrder inyectado que ya maneja clientOrderId AI_...
            const orderResult = await context.placeAIOrder({
                symbol: bot.config.symbol,
                side: side.toLowerCase(),
                type: 'market',
                arg: { usd: currentBalance }
            });

            // 2. CÁLCULO DE RESULTADOS
            if (side === 'BUY') {
                nextEntryPrice = price;
                nextHighestPrice = price;
                newBalance = parseFloat((currentBalance - fee).toFixed(2));
            } else {
                const profitFactor = (price / bot.ailastEntryPrice);
                netProfit = (currentBalance * (profitFactor - 1)) - fee;
                newBalance = parseFloat((currentBalance + netProfit).toFixed(2));
            }

            const shouldStop = side === 'SELL' && bot.config?.ai?.stopAtCycle;
            const newState = shouldStop ? 'STOPPED' : 'RUNNING';

            // 3. ACTUALIZACIÓN DE ESTADO VÍA ORQUESTADOR (Atomic Set)
            const changes = {
                aibalance: newBalance,
                ailastEntryPrice: nextEntryPrice,
                aihighestPrice: nextHighestPrice,
                aistate: newState,
                'config.ai.enabled': !shouldStop
            };

            await context.updateAIStateData(changes);
            
            if (side === 'SELL') {
                await context.updateGeneralBotState({ 
                    $inc: { total_profit: parseFloat(netProfit.toFixed(4)) } 
                });
            }

            // 4. PERSISTENCIA EN HISTORIAL DE ÓRDENES
            await Order.create({
                userId,
                strategy: 'ai',
                executionMode: 'REAL', // Cambiado a REAL porque ahora usamos el orquestador
                orderId: orderResult?.orderId || `ai_${Date.now()}`,
                side,
                price,
                size: parseFloat((currentBalance / price).toFixed(6)),
                notional: currentBalance,
                status: 'FILLED',
                orderTime: new Date()
            });

            // 5. NOTIFICACIÓN FRONTEND
            this._broadcastStatus(userId, {
                aistate: newState,
                virtualBalance: newBalance,
                lastEntryPrice: nextEntryPrice
            });

        } catch (error) {
            context.log(`❌ AI Trade Error: ${error.message}`, 'error');
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