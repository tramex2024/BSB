// BSB/server/src/au/engines/AIEngine.js

const Autobot = require('../../models/Autobot');
const Order = require('../../models/Order'); 
const MarketSignal = require('../../models/MarketSignal'); 
const StrategyManager = require('./StrategyManager');

class AIEngine {
    constructor() {
        this.io = null;
        this.TRAILING_PERCENT = 0.005; // 0.5% pullback
        this.EXCHANGE_FEE = 0.001;     // 0.1% fee estimado
    }

    setIo(io) { this.io = io; }

    async analyze(price, userId) {
        if (!userId || !price) return;

        try {
            // Usamos .lean() para rendimiento, pero recordamos que es solo lectura
            const bot = await Autobot.findOne({ userId }).lean();
            if (!bot || bot.aistate !== 'RUNNING' || !bot.config?.ai?.enabled) return;

            const lastEntryPrice = bot.ailastEntryPrice || 0;
            let highestPrice = bot.aihighestPrice || 0;

            // 1. GESTIÓN DE POSICIÓN ABIERTA (Trailing Stop Virtual)
            if (lastEntryPrice > 0) {
                if (price > highestPrice) {
                    highestPrice = price;
                    await Autobot.updateOne({ userId }, { $set: { aihighestPrice: highestPrice } });
                }

                const stopPrice = highestPrice * (1 - this.TRAILING_PERCENT);
                
                if (price <= stopPrice) {
                    this._log(userId, `🎯 AI: Trailing Stop activado. Salida @ $${price.toFixed(2)}`, 0.95);
                    await this._trade(userId, 'SELL', price, 1.0, bot);
                    return; 
                }
            }

            // 2. BÚSQUEDA DE ENTRADAS (Si no hay posición activa)
            if (lastEntryPrice === 0) {
                const SYMBOL = bot.config?.symbol || 'BTC_USDT';
                const marketData = await MarketSignal.findOne({ symbol: SYMBOL }).lean();
                
                if (marketData && marketData.history && marketData.history.length >= 50) {
                    await this._executeStrategy(userId, price, marketData.history, bot);
                } else if (Math.random() > 0.98) {
                    this._log(userId, "Calibrando sensores neuronales...", 0.1, true);
                }
            }
        } catch (error) {
            console.error(`❌ AI Engine Error (User: ${userId}):`, error);
        }
    }

    async _executeStrategy(userId, price, history, bot) {
        const analysis = StrategyManager.calculate(history);
        if (!analysis) return;

        const { confidence, message } = analysis;
        
        // Umbral de confianza del 85% para entrar
        if (confidence >= 0.85) {
            this._log(userId, `🚀 AI: Señal de alta confianza (${(confidence * 100).toFixed(0)}%). Entrando...`, confidence);
            await this._trade(userId, 'BUY', price, confidence, bot);
        } else if (Math.random() > 0.95) {
            this._log(userId, message, confidence);
        }
    }

    async _trade(userId, side, price, confidence, bot) {
        try {
            const currentBalance = parseFloat(bot.aibalance || bot.config.ai?.amountUsdt || 100);
            const fee = currentBalance * this.EXCHANGE_FEE;
            
            let newBalance = currentBalance;
            let nextEntryPrice = 0;
            let nextHighestPrice = 0;
            let netProfit = 0;

            if (side === 'BUY') {
                nextEntryPrice = price;
                nextHighestPrice = price;
                newBalance = parseFloat((currentBalance - fee).toFixed(2));
            } else {
                const profitFactor = (price / bot.ailastEntryPrice);
                netProfit = (currentBalance * (profitFactor - 1)) - fee;
                newBalance = parseFloat((currentBalance + netProfit).toFixed(2));
            }

            const stopAtCycle = bot.config?.ai?.stopAtCycle || false;
            const shouldStop = side === 'SELL' && stopAtCycle;
            const newState = shouldStop ? 'STOPPED' : 'RUNNING';

            // Actualización Atómica
            await Autobot.updateOne({ userId }, { 
                $set: {
                    aibalance: newBalance,
                    ailastEntryPrice: nextEntryPrice,
                    aihighestPrice: nextHighestPrice,
                    aistate: newState,
                    'config.ai.enabled': !shouldStop
                },
                $inc: { total_profit: side === 'SELL' ? parseFloat(netProfit.toFixed(4)) : 0 }
            });

            // Registro de Orden (Simulada/Analytics)
            await Order.create({
                userId,
                strategy: 'ai',
                executionMode: 'SIMULATED',
                orderId: `ai_${userId.toString().slice(-4)}_${Date.now()}`,
                side,
                price,
                size: parseFloat((currentBalance / price).toFixed(6)),
                notional: currentBalance,
                status: 'FILLED'
            });

            this._broadcastStatus(userId, {
                aistate: newState,
                virtualBalance: newBalance,
                lastEntryPrice: nextEntryPrice
            });

        } catch (error) {
            console.error(`❌ AI Trade Error (User: ${userId}):`, error);
        }
    }

    _broadcastStatus(userId, data) {
        if (this.io) this.io.to(`user_${userId}`).emit('ai-status-update', data);
    }

    _log(userId, msg, conf, isAnalyzing = false) {
        if (this.io) {
            this.io.to(`user_${userId}`).emit('ai-decision-update', { 
                confidence: conf, 
                message: msg, 
                isAnalyzing 
            });
        }
    }
}

module.exports = new AIEngine();