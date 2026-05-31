/**
 * BSB/server/src/states/ai/AIEngine.js
 * Versión Centralizada: Toma de decisiones basada en MarketContext
 */

const Order = require('../../../models/Order'); 
const RiskManager = require('../../managers/AIRiskManager');
const AutoBot = require('../../../models/Autobot');
const TradeCycle = require('../../../models/TradeCycle');

class AIEngine {
    constructor() {
        this.io = null;
        this.EXCHANGE_FEE = 0.001; 
        this.lastEmit = 0;
    }

    setIo(io) { this.io = io; }

    async analyze(price, userId, context) {
        if (!userId || !price || !context) return;
        
        try {
            const { botState, marketContext, safeLog } = context;
            const config = botState.config?.ai || {};
            const userThreshold = config.minConfidence || 0.20;
            const maxOrders = config.maxOrders || 3;

            // 1. ANÁLISIS BASADO EN CONTEXTO CENTRALIZADO
            const { signal, aiConfidence, rsi14, adx } = marketContext;
            const confidencePct = Math.round((aiConfidence || 0) * 100);

            // 2. LOGICA DE CIERRE OBLIGATORIO
            if (botState.ainorder > 0 && (signal === 'STRONG_SELL' || (rsi14 > 80))) {
                await this._trade(userId, 'SELL', price, botState, safeLog, `Cierre Forzoso: Señal ${signal} / RSI ${rsi14?.toFixed(1) || 'N/A'}`);
                return;
            }

            // 3. LOGICA DE APERTURA (DCA)
            if (botState.ainorder < maxOrders && aiConfidence >= userThreshold && signal !== 'STRONG_SELL') {
                const isDCA = botState.ainorder > 0;
                const lastEntryPrice = parseFloat(botState.ailastEntryPrice || 0);
                const shouldBuy = !isDCA || (price < lastEntryPrice * 0.99);

                const riskStatus = RiskManager.checkOperatingState(botState, marketContext);
                if (shouldBuy && riskStatus.canOperate) {
                    await this._trade(userId, 'BUY', price, botState, safeLog, `AI Signal: ${signal}`, maxOrders);
                }
            }

            // 4. EMISIÓN AL FRONTEND
            if (this.io) {
                const now = Date.now();
                if (now - this.lastEmit > 3000) {
                    this.io.to(userId.toString()).emit('ai-pulse-broadcast', {
                        aiConfidence: confidencePct || 0,
                        aiAdx: parseFloat(adx || 0).toFixed(2),
                        aiTrendLabel: signal || 'HOLD',
                        price: price || 0,
                        aiprofit: botState.ainorder > 0 ? (((price / botState.aippc) - 1) * 100).toFixed(2) : 0
                    });
                    this.lastEmit = now;
                }
            }
        } catch (error) {
            console.error(`❌ AI Engine Critical Error [User: ${userId}]:`, error);
        }
    }

    async _manageTrailingStop(price, userId, bot, safeLog, config, currentProfit) {
        try {
            const trailingPct = config.trailingPercent || 0.006;
            if (price > (bot.aihighestPrice || 0)) {
                bot.aihighestPrice = price;
                await AutoBot.updateOne({ userId }, { aihighestPrice: price });
            }
            const stopPrice = bot.aihighestPrice * (1 - trailingPct);
            if (price <= stopPrice && currentProfit > 0.1) { 
                await this._trade(userId, 'SELL', price, bot, safeLog, `Trailing Stop Activado (Max: $${bot.aihighestPrice})`);
            }
        } catch (err) {
            console.error("Error en TrailingStop:", err);
        }
    }

    async _trade(userId, side, price, bot, safeLog, reason, maxOrders = 1) {
        try {
            let updateData = {};
            let investmentAmount = 0;
            let orderSize = 0;

            if (side === 'BUY') {
                const totalAllowed = parseFloat(bot.config?.ai?.amountUsdt || 10);
                investmentAmount = totalAllowed / maxOrders;
                if (bot.aibalance < investmentAmount) return;
                orderSize = parseFloat((investmentAmount / price).toFixed(8));

                const currentQty = bot.aiac || 0;
                const currentPPC = bot.aippc || 0;
                const newQty = currentQty + orderSize;
                const newPPC = ((currentPPC * currentQty) + investmentAmount) / newQty;

                updateData = {
                    aibalance: parseFloat((bot.aibalance - investmentAmount).toFixed(2)),
                    ailastEntryPrice: price,
                    aippc: newPPC,
                    aiac: newQty,
                    aihighestPrice: price,
                    aistartTime: bot.aistartTime || new Date(),
                    ainorder: (bot.ainorder || 0) + 1
                };
            } else {
                const totalCost = (bot.aiac || 0) * (bot.aippc || 0);
                orderSize = parseFloat((bot.aiac || 0).toFixed(8));
                const totalValue = orderSize * price;
                const netProfit = (totalValue - totalCost) - (totalValue * this.EXCHANGE_FEE);
                investmentAmount = totalValue;

                updateData = {
                    aibalance: parseFloat((bot.aibalance + totalValue - (totalValue * this.EXCHANGE_FEE)).toFixed(2)),
                    ailastEntryPrice: 0,
                    aippc: 0,
                    aiac: 0,
                    aihighestPrice: 0,
                    aistartTime: null,
                    ainorder: 0,
                    $inc: { aicycle: 1, total_profit: parseFloat(netProfit.toFixed(4)) }
                };

                // REGISTRO DE CICLO CERRADO
                try {
                    await TradeCycle.create({
                        userId: userId,
                        strategy: 'AI',
                        cycleIndex: (bot.aicycle || 0) + 1,
                        symbol: bot.config?.symbol || 'BTC_USDT',
                        startTime: bot.aistartTime || new Date(),
                        endTime: new Date(),
                        durationHours: (new Date() - new Date(bot.aistartTime || Date.now())) / (1000 * 60 * 60),
                        initialInvestment: totalCost,
                        finalRecovery: totalValue,
                        netProfit: netProfit,
                        profitPercentage: ((price / (bot.aippc || price)) - 1) * 100,
                        averagePPC: bot.aippc || 0,
                        finalSellPrice: price,
                        orderCount: bot.ainorder || 0,
                        status: 'COMPLETED',
                        autobotId: bot._id
                    });
                } catch (cycleErr) {
                    console.error("❌ Error al guardar TradeCycle:", cycleErr);
                }

                // VALIDACIÓN DE PARADA (STOP AT CYCLE)
                const stopAtCycle = bot.config?.ai?.stopAtCycle || false;
                if (stopAtCycle) {
                    updateData["config.ai.enabled"] = false;
                    safeLog("🛑 STOP AT CYCLE ACTIVADO: Ciclo finalizado, IA detenida.", "warning");
                }
            }

            // PERSISTENCIA
            const updatedBot = await AutoBot.findOneAndUpdate({ userId }, updateData, { new: true });
            if (updatedBot) {
                Object.assign(bot, updateData);
                if (updateData.$inc) bot.total_profit = (bot.total_profit || 0) + updateData.$inc.total_profit;
            }

            await Order.create({
                userId, strategy: 'ai', executionMode: 'SIMULATED', orderId: `v_ai_${Date.now()}`,
                side, price, size: orderSize, notional: investmentAmount, status: 'FILLED',
                symbol: bot.config?.symbol || 'BTC_USDT', orderTime: new Date(), reason: reason || `AI Strategy ${side}`
            });

            safeLog(`✅ AI ${side} @ $${price} | Size: ${orderSize}`, 'success');
        } catch (error) {
            console.error("❌ Error detallado en _trade AI:", error);
        }
    }
}

module.exports = new AIEngine();