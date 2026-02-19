/**
 * BSB/server/src/au/engines/AIEngine.js
 * Motor de Decisiones - Versión Refactorizada (Compounding Mode)
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
            
            // 1. GESTIÓN DE RIESGO
            const riskStatus = RiskManager.checkOperatingState(bot);
            if (riskStatus.action === 'RESUME') {
                this._log(userId, "🔄 AI: Saldo operativo detectado. Reanudando...", 0.1);
                await context.updateAIStateData({ aistate: 'RUNNING' });
                return;
            }
            if (bot.aistate !== 'RUNNING') {
                if (bot.aistate === 'PAUSED') this._log(userId, `⚠️ AI PAUSED: Saldo insuficiente ($${parseFloat(bot.aibalance).toFixed(2)})`, 0.01, true);
                if (riskStatus.action === 'PAUSE') await context.updateAIStateData({ aistate: 'PAUSED' });
                return;
            }

            const lastEntryPrice = bot.ailastEntryPrice || 0;

            // 2. GESTIÓN DE POSICIÓN ABIERTA
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

            // 3. ANÁLISIS DE MERCADO PARA ENTRADA
            if (lastEntryPrice === 0) {
                const SYMBOL = (bot.config?.symbol || 'BTC_USDT').replace('USDT', '_USDT');
                const marketData = await MarketSignal.findOne({ symbol: SYMBOL }).lean();
                
                if (!marketData || marketData.history?.length < 250) {
                    this._log(userId, "Colectando datos...", 0.01, true);
                    return;
                }

                const analysis = StrategyManager.calculate(marketData.history);
                if (analysis && analysis.confidence >= 0.75) {
                    this._log(userId, `🚀 AI Signal: ${analysis.message}`, analysis.confidence);
                    await this._trade(userId, 'BUY', price, context);
                } else if (analysis) {
                    this._log(userId, `AI Watching: ${analysis.trend} (Conf: ${(analysis.confidence * 100).toFixed(0)}%)`, analysis.confidence, true);
                }
            }
        } catch (error) {
            console.error(`❌ AI Engine Error (User: ${userId}):`, error);
        }
    }

    async _trade(userId, side, price, context) {
        try {
            const bot = context;
            const investmentAmount = RiskManager.calculateInvestment(bot);
            const fee = investmentAmount * this.EXCHANGE_FEE;
            
            let newBalance = parseFloat(bot.aibalance);
            let netProfit = 0;

            if (side === 'BUY') {
                // Bloqueamos el capital en la entrada (restando comisión)
                newBalance = parseFloat((newBalance - fee).toFixed(2));
            } else {
                // Calculamos profit sobre la inversión inicial de este ciclo
                const profitFactor = (price / bot.ailastEntryPrice);
                netProfit = (investmentAmount * (profitFactor - 1)) - fee;
                newBalance = parseFloat((investmentAmount + netProfit).toFixed(2));
            }

            const shouldStop = (side === 'SELL' && bot.config?.ai?.stopAtCycle);
            const nextState = shouldStop ? 'STOPPED' : (newBalance < RiskManager.MIN_TRADE_AMOUNT ? 'PAUSED' : 'RUNNING');

            await context.updateAIStateData({
                aibalance: newBalance,
                ailastEntryPrice: side === 'BUY' ? price : 0,
                aihighestPrice: side === 'BUY' ? price : 0,
                aistate: nextState,
                'config.ai.enabled': nextState !== 'STOPPED'
            });

            if (side === 'SELL') {
                await context.updateGeneralBotState({ 
                    $inc: { total_profit: parseFloat(netProfit.toFixed(4)) } 
                });
            }

            await Order.create({
                userId, strategy: 'ai', executionMode: 'SIMULATED',
                orderId: `v_ai_${Date.now()}`, side, price,
                size: parseFloat((investmentAmount / price).toFixed(8)),
                notional: investmentAmount, status: 'FILLED', orderTime: new Date()
            });

            this._broadcastStatus(userId, { aistate: nextState, virtualBalance: newBalance });
            context.log(`✅ AI ${side} Virtual @ $${price} (Total: $${investmentAmount.toFixed(2)})`, 'success');
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