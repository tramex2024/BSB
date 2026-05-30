const Order = require('../../../models/Order'); 
const RiskManager = require('../../managers/AIRiskManager');
const AutoBot = require('../../../models/Autobot');

class AIEngine {
    constructor() {
        this.io = null;
        this.EXCHANGE_FEE = 0.001; // 0.1%
    }

    setIo(io) { this.io = io; }

    async analyze(price, userId, context, brain) {
        if (!userId || !price || !context || !brain) return;
        
        global.lastAiStateSnapshot = brain;

        try {
            const bot = context;
            const { confidence, signal, reason, adx, stochK } = brain;
            
            // Configuración
            const config = bot.config?.ai || {};
            const userThreshold = config.minConfidence || 0.20;
            const maxOrders = config.maxOrders || 3;

            // Cálculos para el Dashboard
            const confidencePct = Math.min(Math.max(Math.round((parseFloat(confidence) || 0) * 100), 0), 100);
            const liveAdx = parseFloat(adx) || parseFloat(brain.adx) || 0;
            const liveStoch = parseFloat(stochK) || parseFloat(brain.stochD) || 0;

            // CÁLCULO DE PROFIT EN TIEMPO REAL
            // Si hay posición, calculamos la diferencia entre precio actual y costo promedio
            let currentAiProfit = 0;
            if (bot.ainorder > 0 && bot.aippc > 0) {
                // Cálculo simplificado: (precio_actual / precio_entrada - 1) * cantidad_total
                // Esto se sincroniza con tu función de PnL del frontend
                currentAiProfit = ((price / bot.aippc) - 1) * 100;
            }

            // BROADCAST EN TIEMPO REAL: Emisión atómica
            if (this.io) {
                this.io.to(userId.toString()).emit('ai-pulse-broadcast', {
                    aiConfidence: confidencePct,
                    aiAdx: liveAdx,
                    aiStoch: liveStoch,
                    aiTrendLabel: signal || 'NEUTRAL',
                    aiEngineMsg: reason || 'System Operational',
                    price: price,
                    aiprofit: currentAiProfit // <--- Este es el valor que moverá tu barra
                });
            }

            const safeLog = (msg, type) => {
                if (this.io) this.io.to(userId.toString()).emit('ai-decision-update', { confidence: confidencePct, message: msg, isAnalyzing: true });
            };

            const riskStatus = RiskManager.checkOperatingState(bot);
            if (bot.aistate !== 'RUNNING' && riskStatus.action !== 'RESUME') return;

            // Lógica de Salida
            if (bot.ainorder > 0) {
                const minProfitTarget = config.profitPercent || 1.2;
                const currentProfitPct = ((price / bot.aippc) - 1) * 100;
                const trailingPct = config.trailingPercent || 0.006;
                const stopPrice = (bot.aihighestPrice || price) * (1 - trailingPct);

                if (currentProfitPct >= minProfitTarget || price <= stopPrice) {
                    return await this._manageTrailingStop(price, userId, bot, safeLog, config, currentProfitPct);
                }
            }

            // Lógica de Entrada
            if (confidence >= userThreshold && bot.ainorder < maxOrders) {
                const isDCA = bot.ainorder > 0;
                const lastEntryPrice = parseFloat(bot.ailastEntryPrice || 0);
                const shouldBuy = !isDCA || (price < lastEntryPrice * 0.99);

                if (shouldBuy && riskStatus.canOperate) {
                    await this._trade(userId, 'BUY', price, bot, safeLog, reason, maxOrders);
                }
            }
        } catch (error) {
            console.error(`❌ AI Engine Error [User: ${userId}]:`, error);
        }
    }

    async _manageTrailingStop(price, userId, bot, safeLog, config, currentProfit) {
        try {
            const trailingPct = config.trailingPercent || 0.006;

            // Si el precio marca un nuevo máximo histórico del ciclo, actualizamos DB y memoria local
            if (price > (bot.aihighestPrice || 0)) {
                bot.aihighestPrice = price; // Mutación en memoria crítica
                await AutoBot.updateOne({ userId }, { aihighestPrice: price });
            }

            const stopPrice = bot.aihighestPrice * (1 - trailingPct);

            // EJECUCIÓN DE VENTA: Se ejecuta si cruza el Stop y asegura al menos un break-even razonable (+0.1% post comisiones)
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
                    aippc: newPPC, // Precio promedio de compra
                    aiac: newQty,   // Cantidad acumulada
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
                    aippc: 0, // Reseteamos al cerrar posición
                    aiac: 0,  // Reseteamos al cerrar posición
                    aihighestPrice: 0,
                    aistartTime: null,
                    ainorder: 0,
                    $inc: { aicycle: 1, total_profit: parseFloat(netProfit.toFixed(4)) }
                };
            }

            // 1. Actualizamos en Base de Datos
            const updatedBot = await AutoBot.findOneAndUpdate({ userId }, updateData, { new: true });
            
            // 2. [MEJORA] Actualizamos el objeto en memoria para que el dashboard vea los cambios inmediatamente
            Object.assign(bot, updatedBot.toObject());

            await Order.create({
                userId,
                strategy: 'ai',
                executionMode: 'SIMULATED',
                orderId: `v_ai_${Date.now()}`,
                side,
                price,
                size: orderSize,
                notional: investmentAmount,
                status: 'FILLED',
                symbol: bot.config?.symbol || 'BTC_USDT',
                orderTime: new Date(),
                reason: reason || `AI Strategy ${side}`
            });

            safeLog(`✅ AI ${side} @ $${price} | Size: ${orderSize}`, 'success');
            console.log(`[DB-SYNC] Orden guardada y Bot actualizado para User ${userId}`);

        } catch (error) {
            console.error("❌ Error detallado en _trade AI:", error);
        }
    }

module.exports = new AIEngine();