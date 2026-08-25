/**
 * BSB/server/src/managers/AIRiskManager.js
 * Validación de saldo, régimen y salud del ciclo.
 * AIEngine usa: canOperate, action, reason.
 * canOperate = puede abrir/DCA. Las salidas las decide el engine aunque sea false.
 */
const { AI_MIN_TRADE_AMOUNT, AI_SAFETY_MARGIN } = require('../../utils/tradeConstants');

class AIRiskManager {
    constructor() {
        this.MIN_TRADE_AMOUNT = AI_MIN_TRADE_AMOUNT;
        this.SAFETY_MARGIN = AI_SAFETY_MARGIN;
        this.STALE_MS = 60 * 1000;
        this.MIN_ADX = 18;
        this.MAX_CYCLE_LOSS_PCT = 6;
    }

    _stale(marketContext) {
        const ts = marketContext?.lastUpdate || marketContext?.updatedAt;
        if (!ts) return false;
        return Date.now() - new Date(ts).getTime() > this.STALE_MS;
    }

    _cycleLossPct(bot, marketContext) {
        const qty = parseFloat(bot.aiac || 0);
        const ppc = parseFloat(bot.aippc || 0);
        const price = parseFloat(marketContext?.currentPrice || 0);
        if (!qty || !ppc || !price) return 0;
        return ((price / ppc) - 1) * 100;
    }

    checkOperatingState(bot, marketContext = null) {
        if (!bot) {
            return { action: 'NONE', canOperate: false, reason: 'no-bot' };
        }

        const state = bot.aistate || 'RUNNING';
        if (state === 'STOPPED' || bot.config?.ai?.enabled === false) {
            return { action: 'NONE', canOperate: false, reason: 'disabled' };
        }

        const currentBalance = parseFloat(bot.aibalance || 0);
        const hasBalance = currentBalance >= this.MIN_TRADE_AMOUNT;
        const signal = marketContext?.signal || 'HOLD';
        const adx = parseFloat(marketContext?.adx || 0);
        const inPos = (bot.ainorder || 0) > 0;

        if (this._stale(marketContext)) {
            return { action: 'CONTINUE', canOperate: false, reason: 'stale-context' };
        }

        if (!hasBalance) {
            return {
                action: state === 'RUNNING' ? 'PAUSE' : 'CONTINUE',
                canOperate: false,
                reason: 'low-balance',
            };
        }

        if (signal === 'STRONG_SELL') {
            return {
                action: state === 'RUNNING' ? 'PAUSE' : 'CONTINUE',
                canOperate: false,
                reason: 'strong-sell',
            };
        }

        if (!inPos && adx > 0 && adx < this.MIN_ADX && signal !== 'STRONG_BUY') {
            return { action: 'CONTINUE', canOperate: false, reason: 'low-adx' };
        }

        const pnlPct = this._cycleLossPct(bot, marketContext);
        if (inPos && pnlPct <= -this.MAX_CYCLE_LOSS_PCT) {
            return { action: 'CONTINUE', canOperate: false, reason: 'cycle-drawdown' };
        }

        if (state === 'PAUSED' && hasBalance && signal !== 'STRONG_SELL') {
            return { action: 'RESUME', canOperate: true, reason: 'recovered' };
        }

        return {
            action: 'CONTINUE',
            canOperate: state === 'RUNNING' && hasBalance,
            reason: 'ok',
        };
    }

    calculateInvestment(bot) {
        const balance = parseFloat(bot.aibalance || 0);
        if (balance < this.MIN_TRADE_AMOUNT) return 0;
        const safeInvestment = balance - this.SAFETY_MARGIN;
        return parseFloat(Math.max(0, safeInvestment).toFixed(2));
    }
}

module.exports = new AIRiskManager();