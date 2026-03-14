/**
 * AIEngine.js - Versión Resiliente y Reactiva
 */
const Order = require('../../models/Order'); 
const MarketSignal = require('../../models/MarketSignal'); 
const StrategyManager = require('./StrategyManager');
const RiskManager = require('./AIRiskManager');

class AIEngine {
    constructor() {
        this.io = null;
        this.TRAILING_PERCENT = 0.006; // 0.6% para dar un poco más de aire
        this.EXCHANGE_FEE = 0.001;
        this.CONFIDENCE_THRESHOLD = 0.60; // BAJAMOS EL UMBRAL PARA SER MÁS ACTIVOS
    }

    setIo(io) { this.io = io; }

    async analyze(price, userId, context) {
        if (!userId || !price || !context) return;

        try {
            const bot = context;
            const riskStatus = RiskManager.checkOperatingState(bot);
            
            if (bot.aistate !== 'RUNNING') return;

            const lastEntryPrice = bot.ailastEntryPrice || 0;

            // 1. GESTIÓN DE POSICIÓN ACTIVA (TRAILING STOP)
            if (lastEntryPrice > 0) {
                let highestPrice = bot.aihighestPrice || 0;
                if (price > highestPrice) {
                    highestPrice = price;
                    await context.updateAIStateData({ aihighestPrice: highestPrice });
                }

                const stopPrice = highestPrice * (1 - this.TRAILING_PERCENT);
                
                if (price <= stopPrice) {
                    this._log(userId, `🎯 AI: Trailing Stop @ $${price}`, 0.95);
                    await this._trade(userId, 'SELL', price, context);
                    return; 
                }
            }

            // 2. ANÁLISIS PARA NUEVA ENTRADA (MÁS AGRESIVO)
            if (lastEntryPrice === 0) {
                const SYMBOL = (bot.config?.symbol || 'BTC_USDT').replace('USDT', '_USDT');
                const marketData = await MarketSignal.findOne({ symbol: SYMBOL }).lean();
                
                // Si faltan velas, intentamos analizar con lo que haya (mínimo 50)
                const history = marketData?.history || [];
                if (history.length < 50) {
                    // Quitamos el log repetitivo para no saturar
                    return;
                }

                const analysis = StrategyManager.calculate(history);
                
                if (analysis && analysis.confidence >= this.CONFIDENCE_THRESHOLD) {
                    this._log(userId, `🚀 AI Signal: ${analysis.message} (Conf: ${analysis.confidence.toFixed(2)})`, analysis.confidence);
                    await this._trade(userId, 'BUY', price, context);
                } else if (analysis) {
                    // Enviamos actualización de confianza al dashboard para ver que el bot "está vivo"
                    this._log(userId, `AI Watching: ${analysis.trend}`, analysis.confidence, true);
                }
            }
        } catch (error) {
            console.error(`❌ AI Engine Critical Error:`, error);
        }
    }

    // El método _trade se mantiene igual que tu versión funcional
    async _trade(userId, side, price, context) {
        // ... (Tu lógica de _trade actual está bien, no la tocaremos para evitar errores de saldo)
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