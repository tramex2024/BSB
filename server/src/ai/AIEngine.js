/**
 * BSB/server/src/au/engines/AIEngine.js
 * Motor de Decisiones - Versión con Historial de Ciclos para Dashboard
 */
const Order = require('../../models/Order'); 
const MarketSignal = require('../../models/MarketSignal'); 
const StrategyManager = require('./StrategyManager');
const RiskManager = require('./AIRiskManager');

class AIEngine {
    constructor() {
        this.io = null;
        this.TRAILING_PERCENT = 0.005; 
        this.EXCHANGE_FEE = 0.001;     
    }

    setIo(io) { this.io = io; }

    async analyze(price, userId, context) {
        if (!userId || !price || !context) return;

        try {
            const bot = context;
            const riskStatus = RiskManager.checkOperatingState(bot);
            
            if (riskStatus.action === 'RESUME') {
                this._log(userId, "🔄 AI: Saldo operativo detectado. Reanudando...", 0.1);
                await context.updateAIStateData({ aistate: 'RUNNING' });
                return;
            }
            
            if (bot.aistate !== 'RUNNING') {
                if (bot.aistate === 'PAUSED') this._log(userId, `⚠️ AI PAUSED: Esperando fondos ($${parseFloat(bot.aibalance).toFixed(2)})`, 0.01, true);
                if (riskStatus.action === 'PAUSE') await context.updateAIStateData({ aistate: 'PAUSED' });
                return;
            }

            const lastEntryPrice = bot.ailastEntryPrice || 0;

            if (lastEntryPrice > 0) {
                let highestPrice = bot.aihighestPrice || 0;
                if (price > highestPrice) {
                    highestPrice = price;
                    await context.updateAIStateData({ aihighestPrice: highestPrice });
                }

                const stopPrice = highestPrice * (1 - this.TRAILING_PERCENT);
                if (price <= stopPrice) {
                    this._log(userId, `🎯 AI: Trailing Stop @ $${price.toFixed(2)}`, 0.95);
                    await this._trade(userId, 'SELL', price, context);
                    return; 
                }
            }

            if (lastEntryPrice === 0) {
                const SYMBOL = (bot.config?.symbol || 'BTC_USDT').replace('USDT', '_USDT');
                const marketData = await MarketSignal.findOne({ symbol: SYMBOL }).lean();
                
                if (!marketData || marketData.history?.length < 250) return;

                const analysis = StrategyManager.calculate(marketData.history);
                if (analysis && analysis.confidence >= 0.75) {
                    this._log(userId, `🚀 AI Signal: ${analysis.message}`, analysis.confidence);
                    await this._trade(userId, 'BUY', price, context);
                } else if (analysis) {
                    this._log(userId, `AI Watching: ${analysis.trend} (Conf: ${(analysis.confidence * 100).toFixed(0)}%)`, analysis.confidence, true);
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
                    aistartTime: new Date(), // Inicio del reloj para el dashboard
                    ainorder: 1 // La IA siempre entra con 1 orden
                });
            } else {
                // LÓGICA DE VENTA Y CIERRE DE CICLO
                const profitFactor = (price / bot.ailastEntryPrice);
                const grossRecovery = investmentAmount * profitFactor;
                const sellFee = grossRecovery * this.EXCHANGE_FEE;
                
                netProfit = (grossRecovery - investmentAmount) - sellFee;
                const totalRecovery = grossRecovery - sellFee;
                newBalance = parseFloat((totalRecovery).toFixed(2));

                // --- REGISTRO EN TRADE CYCLES (Para el Dashboard) ---
                if (context.logSuccessfulCycle && bot.aistartTime) {
                    await context.logSuccessfulCycle({
                        userId,
                        autobotId: bot._id,
                        symbol: bot.config.symbol || 'BTC_USDT',
                        strategy: 'AI', // Identificador para el filtro del frontend
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
                const nextState = shouldStop ? 'STOPPED' : (newBalance < 5 ? 'PAUSED' : 'RUNNING');

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

            // Persistencia de la orden individual
            await Order.create({
                userId, strategy: 'ai', executionMode: 'SIMULATED',
                orderId: `v_ai_${Date.now()}`, side, price,
                size: parseFloat((investmentAmount / price).toFixed(8)),
                notional: investmentAmount, status: 'FILLED', orderTime: new Date()
            });

            this._broadcastStatus(userId, { aistate: bot.aistate, virtualBalance: newBalance });
            context.log(`✅ AI ${side} @ $${price}`, 'success');

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