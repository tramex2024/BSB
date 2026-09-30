/**
 * BSB/server/src/states/ai/AIEngine.js
 * Ejecución del Aibot (paper/simulado).
 * La señal vive en marketContext; aquí: filtros, riesgo, DCA, salidas y persistencia.
 * Linea 326 comentada referente a la actualizacion del total_profit.
 */
const Order = require('../../../models/Order');
const RiskManager = require('../../managers/AIRiskManager');
const AutoBot = require('../../../models/Autobot');
const TradeCycle = require('../../../models/TradeCycle');

class AIEngine {
    constructor() {
        this.io = null;
        this.EXCHANGE_FEE = 0.001;
        this.lastEmitByUser = new Map();
        this.lastBuyAtByUser = new Map();
        this.busyUsers = new Set();
        this.STALE_MS = 60 * 1000;
        this.EMIT_MS = 3000;
    }

    setIo(io) {
        this.io = io;
    }

    _cfg(botState) {
        const ai = botState.config?.ai || {};
        return {
            minConfidence: ai.minConfidence ?? 0.58,
            maxOrders: ai.maxOrders || 3,
            amountUsdt: parseFloat(ai.amountUsdt || 10),
            trailingPercent: ai.trailingPercent ?? 0.006,
            stopLossPct: ai.stopLossPct ?? 0.05,
            takeProfitPct: ai.takeProfitPct ?? 0.018,
            dcaPercent: ai.dcaPercent ?? 0.015,
            dcaAtrMult: ai.dcaAtrMult ?? 1.2,
            cooldownMs: ai.cooldownMs ?? 90 * 1000,
            maxCycleHours: ai.maxCycleHours ?? 48,
            minAdx: ai.minAdx ?? 18,
            minRsiBuy: ai.minRsiBuy ?? 28,
            maxRsiBuy: ai.maxRsiBuy ?? 62,
            forceSellRsi: ai.forceSellRsi ?? 80,
            stopAtCycle: ai.stopAtCycle || false,
            enabled: ai.enabled !== false,
            symbol: botState.config?.symbol || 'BTC_USDT',
        };
    }

    _stale(marketContext) {
        const ts = marketContext.lastUpdate || marketContext.updatedAt;
        if (!ts) return false;
        return Date.now() - new Date(ts).getTime() > this.STALE_MS;
    }

    _profitPct(price, ppc) {
        if (!ppc) return 0;
        return (price / ppc - 1) * 100;
    }

    _dcaTriggerPct(marketContext, cfg) {
        const price = parseFloat(marketContext.currentPrice || 0);
        const atr = parseFloat(marketContext.atr || 0);
        if (price > 0 && atr > 0) {
            const atrPct = (atr / price) * cfg.dcaAtrMult;
            return Math.max(cfg.dcaPercent, atrPct);
        }
        return cfg.dcaPercent;
    }

    _canOpen(signal, confidence, cfg, marketContext, isDCA) {
        if (confidence < cfg.minConfidence) return false;
        if (signal === 'STRONG_SELL' || signal === 'SELL') return false;
        if (isDCA) return signal === 'BUY' || signal === 'STRONG_BUY' || signal === 'HOLD';
        if (signal === 'STRONG_BUY') return true;
        if (signal === 'BUY' && confidence >= Math.max(cfg.minConfidence, 0.62)) return true;
        return false;
    }

    _regimeAllowsEntry(marketContext, cfg) {
        const adx = parseFloat(marketContext.adx || 0);
        const rsi = parseFloat(marketContext.rsi14 || 0);
        const macdHist = parseFloat(marketContext.macdHist || 0);
        const signal = marketContext.signal;

        if (adx > 0 && adx < cfg.minAdx && signal !== 'STRONG_BUY') return false;
        if (rsi > 0 && (rsi < cfg.minRsiBuy || rsi > cfg.maxRsiBuy) && signal !== 'STRONG_BUY') return false;
        if (macdHist < 0 && signal !== 'STRONG_BUY') return false;
        return true;
    }

    async analyze(price, userId, context) {
        if (!userId || !price || !context) return;

        const uid = userId.toString();
        if (this.busyUsers.has(uid)) return;
        this.busyUsers.add(uid);

        try {
            const { botState, marketContext } = context;
            const safeLog = context.safeLog || context.log || ((msg, type) => {
                console.log(`[${(type || 'INFO').toUpperCase()}] ${msg}`);
            });

            if (!botState || !marketContext) return;

            const cfg = this._cfg(botState);
            if (!cfg.enabled) return;

            if (this._stale(marketContext)) {
                safeLog('[AI] Contexto de mercado stale — skip tick', 'warning');
                return;
            }

            const signal = marketContext.signal || 'HOLD';
            const aiConfidence = parseFloat(marketContext.aiConfidence ?? marketContext.confidence ?? 0);
            const confidencePct = Math.round(aiConfidence * 100);
            const rsi14 = parseFloat(marketContext.rsi14 || 0);
            const adx = parseFloat(marketContext.adx || 0);
            const inPos = (botState.ainorder || 0) > 0;
            const ppc = parseFloat(botState.aippc || 0);
            const profitPct = inPos ? this._profitPct(price, ppc) : 0;

            const riskStatus = RiskManager.checkOperatingState(botState, marketContext);

            if (riskStatus.action === 'PAUSE' && botState.aistate === 'RUNNING') {
                await AutoBot.updateOne({ userId }, { aistate: 'PAUSED' });
                botState.aistate = 'PAUSED';
                safeLog(`[AI] PAUSE: ${riskStatus.reason || 'riesgo'}`, 'warning');
            }
            if (riskStatus.action === 'RESUME' && botState.aistate === 'PAUSED') {
                await AutoBot.updateOne({ userId }, { aistate: 'RUNNING' });
                botState.aistate = 'RUNNING';
                safeLog('[AI] RESUME: condiciones recuperadas', 'info');
            }

            if (inPos) {
                const forceRsi = rsi14 > 0 && rsi14 >= cfg.forceSellRsi;
                if (signal === 'STRONG_SELL' || forceRsi) {
                    await this._trade(
                        userId, 'SELL', price, botState, safeLog, cfg,
                        `Cierre forzoso: ${signal} / RSI ${rsi14 ? rsi14.toFixed(1) : 'n/a'}`
                    );
                    return;
                }

                if (profitPct <= -(cfg.stopLossPct * 100)) {
                    await this._trade(
                        userId, 'SELL', price, botState, safeLog, cfg,
                        `Stop loss de ciclo (${profitPct.toFixed(2)}%)`
                    );
                    return;
                }

                if (profitPct >= cfg.takeProfitPct * 100) {
                    await this._trade(
                        userId, 'SELL', price, botState, safeLog, cfg,
                        `Take profit (${profitPct.toFixed(2)}%)`
                    );
                    return;
                }

                const started = botState.aistartTime ? new Date(botState.aistartTime) : null;
                if (started) {
                    const hours = (Date.now() - started.getTime()) / 36e5;
                    if (hours >= cfg.maxCycleHours) {
                        await this._trade(
                            userId, 'SELL', price, botState, safeLog, cfg,
                            `Time-stop: ${hours.toFixed(1)}h en ciclo`
                        );
                        return;
                    }
                }

                await this._manageTrailingStop(price, userId, botState, safeLog, cfg, profitPct);
                if ((botState.ainorder || 0) === 0) return;
            }

            const canBuyMore = (botState.ainorder || 0) < cfg.maxOrders;
            const isDCA = (botState.ainorder || 0) > 0;
            const lastBuy = this.lastBuyAtByUser.get(uid) || 0;
            const cooled = Date.now() - lastBuy >= cfg.cooldownMs;

            if (
                canBuyMore &&
                cooled &&
                riskStatus.canOperate &&
                this._canOpen(signal, aiConfidence, cfg, marketContext, isDCA) &&
                (!isDCA ? this._regimeAllowsEntry(marketContext, cfg) : true)
            ) {
                let shouldBuy = !isDCA;
                if (isDCA) {
                    const lastEntry = parseFloat(botState.ailastEntryPrice || 0);
                    const dropNeed = this._dcaTriggerPct(marketContext, cfg);
                    shouldBuy = lastEntry > 0 && price <= lastEntry * (1 - dropNeed);
                }

                if (shouldBuy) {
                    await this._trade(
                        userId, 'BUY', price, botState, safeLog, cfg,
                        `AI ${isDCA ? 'DCA' : 'entry'}: ${signal} (${confidencePct}%)`
                    );
                }
            }

            if ((botState.ainorder || 0) > 0) {
                const qty = botState.aiac || 0;
                const posPpc = parseFloat(botState.aippc || 0);
                const pnl = (price * qty) - (qty * posPpc);
                const pct = this._profitPct(price, posPpc).toFixed(2);
//                safeLog(
//                    `[AI-MONITOR] BTC: ${price} | PPC: ${posPpc.toFixed(2)} (${pct}%) | Orders: ${botState.ainorder} | PNL: ${pnl.toFixed(2)} USDT | ${signal} ${confidencePct}% | ADX ${adx.toFixed(1)}`,
//                    'info'
//                );
            // 3.5 LOG DE MONITOREO (mismo formato que L/S)
            this._emitMonitor(price, botState, marketContext, cfg, riskStatus, safeLog);
            }

            this._emit(uid, {
                aiConfidence: confidencePct || 0,
                aiAdx: adx.toFixed(2),
                aiTrendLabel: signal || 'HOLD',
                price: price || 0,
                aiprofit: (botState.ainorder || 0) > 0
                    ? this._profitPct(price, botState.aippc).toFixed(2)
                    : 0,
            });
        } catch (error) {
            console.error(`❌ AI Engine Critical Error [User: ${userId}]:`, error);
        } finally {
            this.busyUsers.delete(uid);
        }
    }

    _emit(uid, payload) {
        if (!this.io) return;
        const now = Date.now();
        const last = this.lastEmitByUser.get(uid) || 0;
        if (now - last < this.EMIT_MS) return;
        this.lastEmitByUser.set(uid, now);
        this.io.to(uid).emit('ai-pulse-broadcast', payload);
    }

        _monitorTag(bot, cfg, riskStatus, inPos, profitPct) {
        if (!cfg.enabled || bot.aistate === 'STOPPED') return 'AI-STOPPED';
        if (bot.aistate === 'PAUSED' || !riskStatus.canOperate && !inPos) {
            return 'AI-PAUSED';
        }
        if (inPos && profitPct > 0.12) return 'AI-TRAILING';
        if (inPos) return 'AI-BUYING';
        return 'AI-IDLE';
    }

    _emitMonitor(price, bot, marketContext, cfg, riskStatus, safeLog) {
        const inPos = (bot.ainorder || 0) > 0;
        const ppc = parseFloat(bot.aippc || 0);
        const profitPct = inPos ? this._profitPct(price, ppc) : 0;
        const pnl = inPos ? (price * (bot.aiac || 0)) - ((bot.aiac || 0) * ppc) : 0;
        const tag = this._monitorTag(bot, cfg, riskStatus, inPos, profitPct);
        const signal = marketContext.signal || 'HOLD';
        const conf = Math.round(parseFloat(marketContext.aiConfidence ?? marketContext.confidence ?? 0) * 100);
        const adx = parseFloat(marketContext.adx || 0).toFixed(1);
        const level = 'info';

        if (tag === 'AI-STOPPED') {
            safeLog(`[${tag}] 👁️ IA desactivada`, 'debug');
            return;
        }

        if (tag === 'AI-PAUSED') {
            const need = (cfg.amountUsdt / cfg.maxOrders);
            const have = parseFloat(bot.aibalance || 0);
            const missing = Math.max(0, need - have);
            safeLog(
                `[${tag}] 👁️ ${riskStatus.reason || 'paused'} | Available: ${have.toFixed(2)} USDT | Required: ${need.toFixed(2)} USDT (Missing: ${missing.toFixed(2)} USDT) | ${signal} ${conf}%`,
                'debug'
            );
            return;
        }

        if (!inPos) {
            safeLog(
                `[${tag}] 👁️ BTC: ${price.toFixed(2)} | Waiting ${cfg.minConfidence * 100}%+ BUY/STRONG_BUY | Signal: ${signal} ${conf}% | ADX ${adx}`,
                'info'
            );
            return;
        }

        const dropNeed = this._dcaTriggerPct(marketContext, cfg);
        const lastEntry = parseFloat(bot.ailastEntryPrice || ppc);
        const dcaPx = lastEntry * (1 - dropNeed);
        const dcaDist = ((price - dcaPx) / price) * 100;
        const tpPx = ppc * (1 + cfg.takeProfitPct);
        const slPx = ppc * (1 - cfg.stopLossPct);
        const trailPx = parseFloat(bot.aihighestPrice || price) * (1 - cfg.trailingPercent);

        safeLog(
            `[${tag}] 👁️ BTC: ${price.toFixed(2)} | PPC: ${ppc.toFixed(2)} (${profitPct.toFixed(2)}%) | DCA: ${dcaPx.toFixed(2)} (${dcaDist >= 0 ? '-' : '+'}${Math.abs(dcaDist).toFixed(2)}%) | TP Target: ${tpPx.toFixed(2)} (+${(cfg.takeProfitPct * 100).toFixed(2)}%) | SL: ${slPx.toFixed(2)} | Trail: ${trailPx.toFixed(2)} | PNL: ${pnl.toFixed(2)} USDT | Orders: ${bot.ainorder}/${cfg.maxOrders} | ${signal} ${conf}% | ADX ${adx}`,
            level
        );
    }

    async _manageTrailingStop(price, userId, bot, safeLog, cfg, currentProfit) {
        try {
            const trailingPct = cfg.trailingPercent;
            const prevHigh = parseFloat(bot.aihighestPrice || 0);

            if (price > prevHigh) {
                bot.aihighestPrice = price;
                await AutoBot.updateOne({ userId }, { aihighestPrice: price });
            }

            const high = parseFloat(bot.aihighestPrice || price);
            const stopPrice = high * (1 - trailingPct);
            const armed = currentProfit > 0.12;

            if (armed && price <= stopPrice) {
                await this._trade(
                    userId, 'SELL', price, bot, safeLog, cfg,
                    `Trailing stop (max $${high.toFixed(2)} → stop $${stopPrice.toFixed(2)})`
                );
            }
        } catch (err) {
            console.error('Error en TrailingStop:', err);
        }
    }

    async _trade(userId, side, price, bot, safeLog, cfg, reason) {
        try {
            const maxOrders = cfg.maxOrders;
            const uid = userId.toString();
            let setFields = {};
            let incFields = null;
            let investmentAmount = 0;
            let orderSize = 0;
            let netProfit = 0;

            if (side === 'BUY') {
                const totalAllowed = cfg.amountUsdt;
                investmentAmount = totalAllowed / maxOrders;
                if (parseFloat(bot.aibalance || 0) < investmentAmount) {
                    safeLog('[AI] BUY skip: saldo insuficiente', 'warning');
                    return;
                }

                const fee = investmentAmount * this.EXCHANGE_FEE;
                orderSize = parseFloat(((investmentAmount - fee) / price).toFixed(8));
                if (orderSize <= 0) return;

                const currentQty = bot.aiac || 0;
                const currentCost = (bot.aiac || 0) * (bot.aippc || 0);
                const newQty = currentQty + orderSize;
                const newCost = currentCost + investmentAmount;
                const newPPC = newQty > 0 ? newCost / newQty : 0;

                setFields = {
                    aibalance: parseFloat((bot.aibalance - investmentAmount).toFixed(2)),
                    ailastEntryPrice: price,
                    aippc: newPPC,
                    aiac: newQty,
                    aihighestPrice: Math.max(parseFloat(bot.aihighestPrice || 0), price),
                    aistartTime: bot.aistartTime || new Date(),
                    ainorder: (bot.ainorder || 0) + 1,
                };
                this.lastBuyAtByUser.set(uid, Date.now());
            } else {
                orderSize = parseFloat((bot.aiac || 0).toFixed(8));
                if (orderSize <= 0) return;

                const totalCost = (bot.aiac || 0) * (bot.aippc || 0);
                const gross = orderSize * price;
                const fee = gross * this.EXCHANGE_FEE;
                const netValue = gross - fee;
                netProfit = netValue - totalCost;
                investmentAmount = gross;

                setFields = {
                    aibalance: parseFloat((parseFloat(bot.aibalance || 0) + netValue).toFixed(2)),
                    ailastEntryPrice: 0,
                    aippc: 0,
                    aiac: 0,
                    aihighestPrice: 0,
                    aistartTime: null,
                    ainorder: 0,
                };
                incFields = {
                    aicycle: 1,
                    //total_profit: parseFloat(netProfit.toFixed(4)),
                };

                if (cfg.stopAtCycle) {
                    setFields['config.ai.enabled'] = false;
                    safeLog('STOP AT CYCLE: ciclo cerrado, IA detenida.', 'warning');
                }

                try {
                    await TradeCycle.create({
                        userId,
                        strategy: 'AI',
                        cycleIndex: (bot.aicycle || 0) + 1,
                        symbol: cfg.symbol,
                        startTime: bot.aistartTime || new Date(),
                        endTime: new Date(),
                        durationHours: (Date.now() - new Date(bot.aistartTime || Date.now()).getTime()) / 36e5,
                        initialInvestment: totalCost,
                        finalRecovery: netValue,
                        netProfit,
                        profitPercentage: this._profitPct(price, bot.aippc || price),
                        averagePPC: bot.aippc || 0,
                        finalSellPrice: price,
                        orderCount: bot.ainorder || 0,
                        status: 'COMPLETED',
                        autobotId: bot._id,
                    });
                } catch (cycleErr) {
                    console.error('❌ Error al guardar TradeCycle:', cycleErr);
                }
            }

            const update = incFields ? { $set: setFields, $inc: incFields } : { $set: setFields };
            const updatedBot = await AutoBot.findOneAndUpdate({ userId }, update, { new: true });

            if (updatedBot) {
                bot.aibalance = updatedBot.aibalance;
                bot.ailastEntryPrice = updatedBot.ailastEntryPrice;
                bot.aippc = updatedBot.aippc;
                bot.aiac = updatedBot.aiac;
                bot.aihighestPrice = updatedBot.aihighestPrice;
                bot.aistartTime = updatedBot.aistartTime;
                bot.ainorder = updatedBot.ainorder;
                bot.aicycle = updatedBot.aicycle;
                bot.total_profit = updatedBot.total_profit;
                if (updatedBot.config) bot.config = updatedBot.config;
            }

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
                symbol: cfg.symbol,
                orderTime: new Date(),
                reason: reason || `AI Strategy ${side}`,
            });

            safeLog(
                `AI ${side} @ $${price} | Size: ${orderSize} | ${reason}${side === 'SELL' ? ` | PnL ${netProfit.toFixed(4)}` : ''}`,
                'success'
            );
        } catch (error) {
            console.error('❌ Error detallado en _trade AI:', error);
        }
    }
}

module.exports = new AIEngine();