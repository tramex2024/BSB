const Order = require('../../models/Order'); 
const RiskManager = require('./AIRiskManager');
const AutoBot = require('../../models/Autobot');

class AIEngine {
    constructor() {
        this.io = null;
        this.EXCHANGE_FEE = 0.001; // 0.1%
    }

    setIo(io) { this.io = io; }

    async analyze(price, userId, context, brain) {
        if (!userId || !price || !context || !brain) return;

        try {
            const bot = context;
            const { confidence, signal, reason } = brain;
            const lastEntryPrice = parseFloat(bot.ailastEntryPrice || 0);
            
            // Parámetros dinámicos desde la config del usuario
            const config = bot.config?.ai || {};
            const userThreshold = config.minConfidence || 0.20;
            const maxOrders = config.maxOrders || 3; // Límite de particiones DCA

            // --- LOG DE STATUS (RENDER) ---
            const aiStateTag = bot.ainorder > 0 ? `[AI-POS:${bot.ainorder}]` : '[AI-SCANNING]';
            const pnl = bot.ainorder > 0 ? ` | PNL: ${(((price / bot.aippc) - 1) * 100).toFixed(2)}%` : '';
            console.log(`[${new Date().toLocaleTimeString()}] [INFO] [User: ${userId}] ${aiStateTag} 🧠 Conf: ${(confidence * 100).toFixed(1)}% | BTC: ${price}${pnl}`);

            const safeLog = (msg, type) => {
                if (this.io) this.io.to(userId.toString()).emit('ai-decision-update', { confidence, message: msg, isAnalyzing: true });
            };

            const riskStatus = RiskManager.checkOperatingState(bot);
            if (bot.aistate !== 'RUNNING' && riskStatus.action !== 'RESUME') return;

            // 1. GESTIÓN DE SALIDA (Trailing Stop basado en Config)
            if (bot.ainorder > 0) {
                // Solo intentamos vender si estamos en profit mínimo (ej: 0.5%) o por trailing
                const minProfitTarget = config.profitPercent || 1.2;
                const currentProfit = ((price / bot.aippc) - 1) * 100;

                if (currentProfit >= minProfitTarget || price < (bot.aihighestPrice * (1 - (config.trailingPercent || 0.006)))) {
                    return await this._manageTrailingStop(price, userId, bot, safeLog, config);
                }
            }

            // 2. LÓGICA DE ENTRADA / DCA (Particionamiento de Capital)
            // Entra si hay confianza Y no hemos superado el máximo de órdenes
            if (confidence >= userThreshold && bot.ainorder < maxOrders) {
                
                // Si es una re-compra (DCA), pedimos que el precio sea menor al último o que la confianza sea mucho mayor
                const isDCA = bot.ainorder > 0;
                const shouldBuy = !isDCA || (price < bot.ailastEntryPrice * 0.99); // 1% caída para DCA

                if (shouldBuy && riskStatus.canOperate) {
                    await this._trade(userId, 'BUY', price, bot, safeLog, reason, maxOrders);
                }
            }

        } catch (error) {
            console.error(`❌ AI Engine Error [User: ${userId}]:`, error);
        }
    }

    async _manageTrailingStop(price, userId, bot, safeLog, config) {
        let highest = Math.max(price, bot.aihighestPrice || 0);
        const trailingPct = config.trailingPercent || 0.006;

        if (price > bot.aihighestPrice) {
            await AutoBot.updateOne({ userId }, { aihighestPrice: price });
        }

        const stopPrice = highest * (1 - trailingPct);

        // Vender si el precio cae del pico alcanzado
        if (price <= stopPrice && ((price / bot.aippc) - 1) * 100 > 0.3) { 
            await this._trade(userId, 'SELL', price, bot, safeLog, "Trailing Stop Loss/Profit");
        }
    }

    async _trade(userId, side, price, bot, safeLog, reason, maxOrders = 1) {
    try {
        let updateData = {};
        let investmentAmount = 0;
        let orderSize = 0; // <--- Variable para el tamaño de la orden

        if (side === 'BUY') {
            const totalAllowed = parseFloat(bot.config?.ai?.amountUsdt || 10);
            investmentAmount = totalAllowed / maxOrders;

            if (bot.aibalance < investmentAmount) return;

            // Calcular size: Inversión / Precio
            orderSize = parseFloat((investmentAmount / price).toFixed(8));

            const newQty = bot.aiac + orderSize;
            const newPPC = ((bot.aippc * bot.aiac) + investmentAmount) / newQty;

            updateData = {
                aibalance: parseFloat((bot.aibalance - investmentAmount).toFixed(2)),
                ailastEntryPrice: price,
                aippc: newPPC,
                aiac: newQty,
                aihighestPrice: price,
                aistartTime: bot.aistartTime || new Date(),
                ainorder: bot.ainorder + 1
            };
        } else {
            // Lógica de Venta
            const totalCost = bot.aiac * bot.aippc;
            orderSize = parseFloat(bot.aiac.toFixed(8)); // Vendemos todo lo acumulado
            
            const totalValue = orderSize * price;
            const netProfit = (totalValue - totalCost) - (totalValue * this.EXCHANGE_FEE);
            
            investmentAmount = totalValue; // Monto final de la venta

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
        }

        // 1. PERSISTENCIA EN AUTOBOT
        const updatedBot = await AutoBot.findOneAndUpdate({ userId }, updateData, { new: true });

        // 2. PERSISTENCIA EN ORDERS (¡Aquí estaba el fallo!)
        await Order.create({
            userId,
            strategy: 'ai',
            executionMode: 'SIMULATED',
            orderId: `v_ai_${Date.now()}`,
            side,
            price,
            size: orderSize, // <--- AHORA SÍ ENVIAMOS EL SIZE REQUERIDO
            notional: investmentAmount,
            status: 'FILLED',
            symbol: bot.config?.symbol || 'BTC_USDT', // Añadido por seguridad
            orderTime: new Date(),
            reason: reason || (side === 'BUY' ? 'AI Strategy Entry' : 'AI Strategy Exit')
        });

        safeLog(`✅ AI ${side} @ $${price} | Size: ${orderSize}`, 'success');
        console.log(`[DB-SYNC] Orden guardada y Bot actualizado para User ${userId}`);

    } catch (error) {
        // Log mucho más descriptivo por si falta otro campo
        console.error("❌ Error detallado en _trade AI:", error);
    }
}

module.exports = new AIEngine();