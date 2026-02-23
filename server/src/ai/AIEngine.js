// BSB/server/src/au/engines/AIEngine.js

const Order = require('../../models/Order'); 
const MarketSignal = require('../../models/MarketSignal'); 
const StrategyManager = require('./StrategyManager');
const RiskManager = require('./AIRiskManager');

class AIEngine {
    constructor() {
        this.io = null;
        this.TRAILING_PERCENT = 0.005; // 0.5% 
        this.EXCHANGE_FEE = 0.001;     // 0.1% 
    }

    setIo(io) { this.io = io; }

    async analyze(price, userId, context) {
        if (!userId || !price || !context) return;

        try {
            const bot = context;
            const riskStatus = RiskManager.checkOperatingState(bot);
            
            // 1. GESTIÓN DE ESTADOS (Auto-Resume / Auto-Pause)
            // 🟢 AUDITORÍA: Permite que la IA se autogestione según la liquidez del usuario
            if (riskStatus.action === 'RESUME') {
                context.log(`[AI-RUNNING] 👁️ Balance detected. Resuming Neural Core...`, 'debug');
                await context.updateAIStateData({ aistate: 'RUNNING' });
                return;
            }
            
            if (bot.aistate !== 'RUNNING') {
                if (bot.aistate === 'PAUSED') {
                    context.log(`[AI-PAUSED] 👁️ Waiting for funds: $${parseFloat(bot.aibalance).toFixed(2)} USDT`, 'debug');
                }
                if (riskStatus.action === 'PAUSE') await context.updateAIStateData({ aistate: 'PAUSED' });
                return;
            }

            const lastEntryPrice = bot.ailastEntryPrice || 0;

            // 2. GESTIÓN DE POSICIÓN ACTIVA (TRAILING STOP)
            // 🟢 AUDITORÍA: Lógica de protección de beneficios dinámica
            if (lastEntryPrice > 0) {
                let highestPrice = bot.aihighestPrice || 0;
                if (price > highestPrice) {
                    highestPrice = price;
                    await context.updateAIStateData({ aihighestPrice: highestPrice });
                }

                const stopPrice = highestPrice * (1 - this.TRAILING_PERCENT);
                context.log(`[AI-RUNNING] 👁️ Trailing Position | Stop: $${stopPrice.toFixed(2)} | Current: $${price.toFixed(2)}`, 'debug');

                if (price <= stopPrice) {
                    this._log(userId, `🎯 AI: Trailing Stop triggered @ $${price.toFixed(2)}`, 0.95);
                    await this._trade(userId, 'SELL', price, context);
                    return; 
                }
            }

            // 3. ANÁLISIS PARA NUEVA ENTRADA
            if (lastEntryPrice === 0) {
                const SYMBOL = (bot.config?.symbol || 'BTC_USDT').replace('USDT', '_USDT');
                const marketData = await MarketSignal.findOne({ symbol: SYMBOL }).lean();
                
                if (!marketData || marketData.history?.length < 250) {
                    context.log(`[AI-RUNNING] 👁️ Synchronizing market data history...`, 'debug');
                    return;
                }

                const analysis = StrategyManager.calculate(marketData.history);
                
                if (analysis && analysis.confidence >= 0.75) {
                    this._log(userId, `🚀 AI Signal: ${analysis.message}`, analysis.confidence);
                    await this._trade(userId, 'BUY', price, context);
                } else if (analysis) {
                    // Feedback visual de confianza para el Dashboard del usuario
                    context.log(`[AI-RUNNING] 👁️ Scan: ${analysis.trend} | Confidence: ${(analysis.confidence * 100).toFixed(0)}% | Price: $${price.toFixed(2)}`, 'debug');
                    this._log(userId, `AI Watching: ${analysis.trend}`, analysis.confidence, true);
                }
            }
        } catch (error) {
            console.error(`❌ AI Engine Error:`, error);
        }
    }

    async _trade(userId, side, price, context) {
        try {
            const bot = context;
            const investmentAmount = RiskManager.calculateInvestment(bot);
            const fee = investmentAmount * this.EXCHANGE_FEE;
            const currentCycleIndex = Number(bot.aicycle || 0);
            
            let newBalance = parseFloat(bot.aibalance);
            let netProfit = 0;

            if (side === 'BUY') {
                newBalance = parseFloat((newBalance - fee).toFixed(2));
                
                await context.updateAIStateData({
                    aibalance: newBalance,
                    ailastEntryPrice: price,
                    aihighestPrice: price,
                    aistartTime: new Date(),
                    ainorder: 1
                });
            } else {
                // Cálculo de PNL al cerrar posición
                const profitFactor = (price / bot.ailastEntryPrice);
                const grossRecovery = investmentAmount * profitFactor;
                const sellFee = grossRecovery * this.EXCHANGE_FEE;
                
                netProfit = (grossRecovery - investmentAmount) - sellFee;
                const totalRecovery = grossRecovery - sellFee;
                newBalance = parseFloat((totalRecovery).toFixed(2));

                if (context.logSuccessfulCycle && bot.aistartTime) {
                    await context.logSuccessfulCycle({
                        userId,
                        autobotId: bot._id,
                        symbol: bot.config.symbol || 'BTC_USDT',
                        strategy: 'AI',
                        cycleIndex: currentCycleIndex + 1,
                        startTime: bot.aistartTime,
                        endTime: new Date(),
                        averagePPC: bot.ailastEntryPrice,
                        finalSellPrice: price,
                        orderCount: 1,
                        initialInvestment: investmentAmount,
                        finalRecovery: totalRecovery,
                        netProfit: netProfit,
                        profitPercentage: (netProfit / investmentAmount) * 100
                    });
                }

                const shouldStop = bot.config?.ai?.stopAtCycle === true;
                const nextState = shouldStop ? 'STOPPED' : (newBalance < RiskManager.MIN_TRADE_AMOUNT ? 'PAUSED' : 'RUNNING');

                await context.updateAIStateData({
                    aibalance: newBalance,
                    ailastEntryPrice: 0,
                    aihighestPrice: 0,
                    aistartTime: null,
                    aicycle: currentCycleIndex + 1,
                    ainorder: 0,
                    aistate: nextState,
                    'config.ai.enabled': !shouldStop
                });

                await context.updateGeneralBotState({ 
                    $inc: { total_profit: parseFloat(netProfit.toFixed(4)) } 
                });
            }

            // Registro persistente en la colección de Órdenes
            await Order.create({
                userId, strategy: 'ai', executionMode: 'SIMULATED',
                orderId: `v_ai_${Date.now()}`, side, price,
                size: parseFloat((investmentAmount / price).toFixed(8)),
                notional: investmentAmount, status: 'FILLED', orderTime: new Date()
            });

            this._broadcastStatus(userId, { aistate: bot.aistate, virtualBalance: newBalance });
            context.log(`✅ AI ${side} Order Executed @ $${price}`, 'success');

        } catch (error) {
            context.log(`❌ AI Trade Error: ${error.message}`, 'error');
        }
    }

    _broadcastStatus(userId, data) {
        if (this.io) this.io.to(userId.toString()).emit('ai-status-update', data);
    }

    _log(userId, msg, conf, isAnalyzing = false) {
        if (this.io) {
            this.io.to(userId.toString()).emit('ai-decision-update', { 
                confidence: conf, message: msg, isAnalyzing 
            });
        }
    }
}

module.exports = new AIEngine();