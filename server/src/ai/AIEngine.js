// BSB/server/src/au/engines/AIEngine.js

/**
 * AIEngine.js - Predictive Execution Engine
 * Manages Trailing Stops and Signal Execution per User.
 */

const Autobot = require('../../models/Autobot');
const Order = require('../../models/Order'); 
const MarketSignal = require('../../models/MarketSignal'); 
const StrategyManager = require('./StrategyManager');

class AIEngine {
    constructor() {
        this.io = null;
        this.TRAILING_PERCENT = 0.005; // 0.5% allowed pullback
        this.EXCHANGE_FEE = 0.001;     // 0.1% estimated fee
    }

    setIo(io) { this.io = io; }

    async analyze(price, userId) {
        if (!userId) return;

        try {
            const bot = await Autobot.findOne({ userId }).lean();
            if (!bot || bot.aistate !== 'RUNNING') return;

            const lastEntryPrice = bot.ailastEntryPrice || 0;
            let highestPrice = bot.aihighestPrice || 0;

            // 1. OPEN POSITION MANAGEMENT (Trailing Stop)
            if (lastEntryPrice > 0) {
                // Update peak price if current price is higher
                if (price > highestPrice) {
                    highestPrice = price;
                    await Autobot.updateOne({ userId }, { $set: { aihighestPrice: highestPrice } });
                }

                // Dynamic Stop Calculation
                const stopPrice = highestPrice * (1 - this.TRAILING_PERCENT);
                
                if (price <= stopPrice) {
                    this._log(userId, `🎯 Trailing Stop triggered: Exit @ $${price}`, 0.95);
                    await this._trade(userId, 'SELL', price, 1.0, bot);
                    return; 
                }
            }

            // 2. SEARCH FOR NEW ENTRIES (If no open position)
            if (lastEntryPrice === 0) {
                const marketData = await MarketSignal.findOne({ symbol: 'BTC_USDT' }).lean();
                if (marketData && marketData.history && marketData.history.length >= 50) {
                    await this._executeStrategy(userId, price, marketData.history, bot);
                } else if (Math.random() > 0.98) {
                    this._log(userId, "Calibrating AI sensors...", 0.1, true);
                }
            }
        } catch (error) {
            console.error(`❌ AI Analyze Error (User: ${userId}):`, error);
        }
    }

    async _executeStrategy(userId, price, history, bot) {
        const analysis = StrategyManager.calculate(history);
        if (!analysis) return;

        const { confidence, message } = analysis;
        
        // 85% confidence threshold to enter trade
        if (confidence >= 0.85) {
            await this._trade(userId, 'BUY', price, confidence, bot);
        } else if (Math.random() > 0.95) {
            // Visual feedback for the user dashboard
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
                newBalance -= fee; // Deduct fee on entry
            } else {
                // PNL = ((Sell Price / Buy Price) - 1) * Capital - Fee
                const profitFactor = (price / bot.ailastEntryPrice);
                netProfit = (currentBalance * (profitFactor - 1)) - fee;
                newBalance += netProfit;
            }

            const stopAtCycle = bot.config?.ai?.stopAtCycle || false;
            const shouldStop = side === 'SELL' && stopAtCycle;
            const newState = shouldStop ? 'STOPPED' : 'RUNNING';

            // Atomic update for AI state
            await Autobot.updateOne({ userId }, { 
                $set: {
                    aibalance: newBalance,
                    ailastEntryPrice: nextEntryPrice,
                    aihighestPrice: nextHighestPrice,
                    aistate: newState,
                    'config.ai.enabled': !shouldStop
                },
                $inc: { total_profit: side === 'SELL' ? netProfit : 0 }
            });

            // Log order for analytics
            await Order.create({
                userId,
                strategy: 'ai',
                cycleIndex: bot.aicycle || 0,
                executionMode: 'SIMULATED',
                orderId: `ai_${userId.toString().slice(-4)}_${Date.now()}`,
                side,
                price,
                size: currentBalance / price,
                notional: currentBalance,
                status: 'FILLED'
            });

            this._broadcastStatus(userId, {
                aistate: newState,
                virtualBalance: newBalance.toFixed(2),
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