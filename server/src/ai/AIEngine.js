/**
 * BSB/server/src/au/engines/AIEngine.js
 * Motor de Decisiones - Versión Producción 2026 (Dashboard Ready)
 * Actualización: Estandarización de logs "Eye Monitor"
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
            
            // 1. MANEJO DE ESTADOS (Auto-Resume / Auto-Pause)
            if (riskStatus.action === 'RESUME') {
                context.log(`[L-RUNNING] 👁️ Balance detected. Resuming Neural Core...`, 'debug');
                await context.updateAIStateData({ aistate: 'RUNNING' });
                return;
            }
            
            if (bot.aistate !== 'RUNNING') {
                if (bot.aistate === 'PAUSED') {
                    // Log estandarizado para pausa por fondos
                    context.log(`[L-PAUSED] 👁️ Waiting for funds: $${parseFloat(bot.aibalance).toFixed(2)} USDT`, 'debug');
                }
                if (riskStatus.action === 'PAUSE') await context.updateAIStateData({ aistate: 'PAUSED' });
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
                
                // Log de monitoreo de posición activa
                context.log(`[L-RUNNING] 👁️ Trailing Position | Stop: $${stopPrice.toFixed(2)} | Current: $${price.toFixed(2)}`, 'debug');

                if (price <= stopPrice) {
                    this._log(userId, `🎯 AI: Trailing Stop triggered @ $${price.toFixed(2)}`, 0.95);
                    await this._trade(userId, 'SELL', price, context);
                    return; 
                }
            }

            // 3. ANÁLISIS PARA NUEVA ENTRADA
            if (lastEntryPrice === 0) {
                const SYMBOL = (bot.config?.symbol || 'BTC_USDT').replace('USDT', '_USDT');
                const marketData = await MarketSignal.findOne({ symbol: SYMBOL }).lean();
                
                if (!marketData || marketData.history?.length < 250) {
                    context.log(`[L-RUNNING] 👁️ Synchronizing market data history...`, 'debug');
                    return;
                }

                const analysis = StrategyManager.calculate(marketData.history);
                
                if (analysis && analysis.confidence >= 0.75) {
                    this._log(userId, `🚀 AI Signal: ${analysis.message}`, analysis.confidence);
                    await this._trade(userId, 'BUY', price, context);
                } else if (analysis) {
                    // Log estandarizado de monitoreo de RSI y señales
                    context.log(`[L-RUNNING] 👁️ Scan: ${analysis.trend} | Confidence: ${(analysis.confidence * 100).toFixed(0)}% | Price: $${price.toFixed(2)}`, 'debug');
                    
                    // Actualizar el medidor visual de confianza en el Dashboard
                    this._log(userId, `AI Watching: ${analysis.trend}`, analysis.confidence, true);
                }
            }
        } catch (error) {
            console.error(`❌ AI Engine Error:`, error);
        }
    }

    // ... (El resto del método _trade y auxiliares se mantienen igual)
    async _trade(userId, side, price, context) {
        // ... (Tu lógica de trade actual)
        // Solo asegúrate de que el log de éxito también sea en inglés
        context.log(`✅ AI ${side} Order Executed @ $${price}`, 'success');
        // ...
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