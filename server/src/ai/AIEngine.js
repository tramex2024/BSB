const Order = require('../../models/Order'); 
const RiskManager = require('./AIRiskManager');

class AIEngine {
    constructor() {
        this.io = null;
        this.TRAILING_PERCENT = 0.006; // 0.6%
        this.EXCHANGE_FEE = 0.001;     // 0.1%
    }

    setIo(io) { this.io = io; }

    /**
     * ANALYZE (Versión Light)
     * Recibe la decisión ya tomada por el CentralAnalyzer para ahorrar CPU.
     */
    async analyze(price, userId, context, brain) {
        if (!userId || !price || !context || !brain) return;

        try {
            const bot = context;
            const { confidence, signal, reason } = brain;
            const lastEntryPrice = parseFloat(bot.ailastEntryPrice || 0);

            const safeLog = (msg, type) => {
                if (typeof context.log === 'function') context.log(msg, type);
                else console.log(`[AI-LOG][${type}] ${msg}`);
            };

            // 1. GESTIÓN DE RIESGO OPERATIVO
            const riskStatus = RiskManager.checkOperatingState(bot);
            
            if (riskStatus.action === 'RESUME') {
                if (typeof context.updateAIStateData === 'function') {
                    await context.updateAIStateData({ aistate: 'RUNNING' });
                }
                return;
            }

            if (bot.aistate !== 'RUNNING' && riskStatus.action !== 'RESUME') return;

            // 2. MONITOREO DE POSICIÓN ACTIVA (TRAILING STOP)
            if (lastEntryPrice > 0) {
                return await this._manageTrailingStop(price, userId, bot, context, safeLog);
            }

            // 3. LÓGICA DE ENTRADA (Basada en el 'brain' inyectado)
            const userThreshold = bot.config?.ai?.minConfidence || 0.20;

            if (confidence >= userThreshold && signal === 'BUY') {
                const currentBalance = parseFloat(bot.aibalance || 0);

                if (riskStatus.canOperate && currentBalance >= 5.0) {
                    this._log(userId, `🚀 AI Entry Signal: ${reason}`, confidence);
                    await this._trade(userId, 'BUY', price, context, safeLog);
                } else if (currentBalance < 5.0) {
                    safeLog(`⚠️ AI quiso COMPRAR pero saldo insuficiente ($${currentBalance})`, 'warning');
                }
            } else {
                // Heartbeat de análisis para el frontend del usuario
                this._log(userId, `AI Scanning: ${signal} (${(confidence * 100).toFixed(1)}%)`, confidence, true);
            }

        } catch (error) {
            console.error(`❌ AI Engine Error [User: ${userId}]:`, error);
        }
    }

    /**
     * Gestión interna de Trailing Stop
     */
    async _manageTrailingStop(price, userId, bot, context, safeLog) {
        let highestPrice = parseFloat(bot.aihighestPrice || 0);
        
        if (price > highestPrice) {
            highestPrice = price;
            if (typeof context.updateAIStateData === 'function') {
                await context.updateAIStateData({ aihighestPrice: highestPrice });
            }
        }

        const stopPrice = highestPrice * (1 - this.TRAILING_PERCENT);

        if (price <= stopPrice) {
            this._log(userId, `🎯 AI: Trailing Stop activado @ $${price.toFixed(2)}`, 0.95);
            await this._trade(userId, 'SELL', price, context, safeLog);
        }
    }

    /**
     * Ejecución de Trade (Simulado o Real según tu configuración)
     */
    async _trade(userId, side, price, context, safeLog) {
        try {
            const bot = context;
            const investmentAmount = RiskManager.calculateInvestment(bot);
            const fee = investmentAmount * this.EXCHANGE_FEE;
            const currentCycleIndex = Number(bot.aicycle || 0);
            
            let newBalance = parseFloat(bot.aibalance || 0);
            let netProfit = 0;
            const updateData = {};

            if (side === 'BUY') {
                newBalance = parseFloat((newBalance - fee).toFixed(2));
                Object.assign(updateData, {
                    aibalance: newBalance,
                    ailastEntryPrice: price,
                    aihighestPrice: price,
                    aistartTime: new Date(),
                    ainorder: 1
                });
            } else {
                const profitFactor = (price / bot.ailastEntryPrice);
                const grossRecovery = investmentAmount * profitFactor;
                const sellFee = grossRecovery * this.EXCHANGE_FEE;
                netProfit = (grossRecovery - investmentAmount) - sellFee;
                const totalRecovery = grossRecovery - sellFee;
                newBalance = parseFloat((newBalance + totalRecovery - investmentAmount).toFixed(2));

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

                const nextState = newBalance < 10 ? 'PAUSED' : 'RUNNING';

                Object.assign(updateData, {
                    aibalance: newBalance,
                    ailastEntryPrice: 0,
                    aihighestPrice: 0,
                    aistartTime: null,
                    aicycle: currentCycleIndex + 1,
                    ainorder: 0,
                    aistate: nextState
                });

                if (typeof context.updateGeneralBotState === 'function') {
                    await context.updateGeneralBotState({ 
                        $inc: { total_profit: parseFloat(netProfit.toFixed(4)) } 
                    });
                }
            }

            if (typeof context.updateAIStateData === 'function') {
                await context.updateAIStateData(updateData);
            }

            await Order.create({
                userId, strategy: 'ai', executionMode: 'SIMULATED', orderId: `v_ai_${Date.now()}`,
                side, price, size: parseFloat((investmentAmount / price).toFixed(8)),
                notional: investmentAmount, status: 'FILLED', orderTime: new Date()
            });

            this._broadcastStatus(userId, { aistate: side === 'BUY' ? 'RUNNING' : 'IDLE', virtualBalance: newBalance });
            safeLog(`✅ AI ${side} Ejecutada @ $${price.toFixed(2)}`, 'success');

        } catch (error) {
            safeLog(`❌ AI Trade Error: ${error.message}`, 'error');
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