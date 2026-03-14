const Order = require('../../models/Order'); 
const MarketSignal = require('../../models/MarketSignal'); 
const StrategyManager = require('./StrategyManager');
const RiskManager = require('./AIRiskManager');

class AIEngine {
    constructor() {
        this.io = null;
        this.TRAILING_PERCENT = 0.006; // 0.6% de margen para el trailing
        this.EXCHANGE_FEE = 0.001;     // 0.1% de comisión simulada
        this.CONFIDENCE_THRESHOLD = 0.60; // El nuevo umbral reactivo
    }

    setIo(io) { this.io = io; }

    async analyze(price, userId, context) {
        if (!userId || !price || !context) return;

        try {
            const bot = context;
            const riskStatus = RiskManager.checkOperatingState(bot);
            
            // 1. GESTIÓN DE ESTADOS (Auto-Resume / Auto-Pause)
            if (riskStatus.action === 'RESUME') {
                await context.updateAIStateData({ aistate: 'RUNNING' });
                return;
            }
            
            if (bot.aistate !== 'RUNNING') {
                if (riskStatus.action === 'PAUSE' && bot.aistate !== 'PAUSED') {
                    await context.updateAIStateData({ aistate: 'PAUSED' });
                }
                return;
            }

            const lastEntryPrice = bot.ailastEntryPrice || 0;

            // 2. GESTIÓN DE POSICIÓN ACTIVA (TRAILING STOP)
            if (lastEntryPrice > 0) {
                let highestPrice = bot.aihighestPrice || 0;
                if (price > highestPrice) {
                    highestPrice = price;
                    await context.updateAIStateData({ aihighestPrice: highestPrice });
                }

                const stopPrice = highestPrice * (1 - this.TRAILING_PERCENT);
                
                // Log de monitoreo ocasional
                if (Math.random() > 0.9) {
                    context.log(`[AI] Trailing Stop: $${stopPrice.toFixed(2)} | Actual: $${price.toFixed(2)}`, 'debug');
                }

                if (price <= stopPrice) {
                    this._log(userId, `🎯 AI: Trailing Stop triggered @ $${price.toFixed(2)}`, 0.95);
                    await this._trade(userId, 'SELL', price, context);
                    return; 
                }
            }

            // 3. ANÁLISIS PARA NUEVA ENTRADA (HÍBRIDO)
            if (lastEntryPrice === 0) {
                const SYMBOL = (bot.config?.symbol || 'BTC_USDT').replace('USDT', '_USDT');
                const marketData = await MarketSignal.findOne({ symbol: SYMBOL }).lean();
                
                // Resiliencia: Si no hay 100 velas, no operamos para evitar cálculos erróneos
                if (!marketData || !marketData.history || marketData.history.length < 100) {
                    return;
                }

                const analysis = StrategyManager.calculate(marketData.history);
                
                if (analysis && analysis.confidence >= this.CONFIDENCE_THRESHOLD) {
                    this._log(userId, `🚀 AI Signal: ${analysis.message}`, analysis.confidence);
                    await this._trade(userId, 'BUY', price, context);
                } else if (analysis) {
                    // Actualiza el dashboard con la confianza actual aunque no compre
                    this._log(userId, `AI Watching: ${analysis.trend} (${(analysis.confidence * 100).toFixed(0)}%)`, analysis.confidence, true);
                }
            }
        } catch (error) {
            console.error(`❌ AI Engine Error [User: ${userId}]:`, error);
        }
    }

    async _trade(userId, side, price, context) {
        try {
            const bot = context;
            const investmentAmount = RiskManager.calculateInvestment(bot);
            const fee = investmentAmount * this.EXCHANGE_FEE;
            const currentCycleIndex = Number(bot.aicycle || 0);
            
            let newBalance = parseFloat(bot.aibalance || 0);
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
                // LÓGICA DE VENTA Y CIERRE DE CICLO
                const profitFactor = (price / bot.ailastEntryPrice);
                const grossRecovery = investmentAmount * profitFactor;
                const sellFee = grossRecovery * this.EXCHANGE_FEE;
                
                netProfit = (grossRecovery - investmentAmount) - sellFee;
                const totalRecovery = grossRecovery - sellFee;
                
                // Calculamos el nuevo balance sumando el retorno neto
                newBalance = parseFloat((newBalance + totalRecovery - investmentAmount).toFixed(2));

                // Registro de estadísticas del ciclo
                if (typeof context.logSuccessfulCycle === 'function' && bot.aistartTime) {
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
                const nextState = shouldStop ? 'STOPPED' : (newBalance < 10 ? 'PAUSED' : 'RUNNING');

                await context.updateAIStateData({
                    aibalance: newBalance,
                    ailastEntryPrice: 0,
                    aihighestPrice: 0,
                    aistartTime: null,
                    aicycle: currentCycleIndex + 1,
                    ainorder: 0,
                    aistate: nextState
                });

                // Actualizar profit acumulado global
                await context.updateGeneralBotState({ 
                    $inc: { total_profit: parseFloat(netProfit.toFixed(4)) } 
                });
            }

            // Crear registro de orden en DB
            await Order.create({
                userId,
                strategy: 'ai',
                executionMode: 'SIMULATED',
                orderId: `v_ai_${Date.now()}`,
                side,
                price,
                size: parseFloat((investmentAmount / price).toFixed(8)),
                notional: investmentAmount,
                status: 'FILLED',
                orderTime: new Date()
            });

            this._broadcastStatus(userId, { aistate: side === 'BUY' ? 'RUNNING' : 'STOPPED/PAUSED', virtualBalance: newBalance });
            context.log(`✅ AI ${side} Executed @ $${price.toFixed(2)}`, 'success');

        } catch (error) {
            context.log(`❌ AI Trade Error: ${error.message}`, 'error');
            console.error(error);
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