/**
 * BSB/server/src/au/engines/AIEngine.js
 * AI Engine - Motor de Decisiones Neuronales (Versión Auditada 2026)
 */

const Autobot = require('../../models/Autobot');
const Order = require('../../models/Order'); 
const MarketSignal = require('../../models/MarketSignal'); 
const StrategyManager = require('./StrategyManager');

class AIEngine {
    constructor() {
        this.io = null;
        this.TRAILING_PERCENT = 0.005; // 0.5%
        this.EXCHANGE_FEE = 0.001;     // 0.1%
    }

    setIo(io) {
        this.io = io;
    }

     /**
     * Punto de entrada principal: Analiza el precio y decide si actuar.
     */
    async analyze(price, userId) {
        if (!userId || !price) return;

        try {
            // 1. Buscamos el bot y verificamos estado
            const bot = await Autobot.findOne({ userId }).lean();
            if (!bot || bot.aistate !== 'RUNNING') return;

            const lastEntryPrice = bot.ailastEntryPrice || 0;
            let highestPrice = bot.aihighestPrice || 0;

            // --- GESTIÓN DE POSICIÓN ABIERTA (Trailing Stop) ---
            if (lastEntryPrice > 0) {
                if (price > highestPrice) {
                    highestPrice = price;
                    await Autobot.updateOne({ userId }, { $set: { aihighestPrice: highestPrice } });
                }

                const stopPrice = highestPrice * (1 - this.TRAILING_PERCENT);
                
                if (price <= stopPrice) {
                    this._log(userId, `🎯 AI: Trailing Stop activado. Salida @ $${price.toFixed(2)}`, 0.95);
                    await this._trade(userId, 'SELL', price, 1.0, bot);
                    return; 
                }
            }

            // --- BÚSQUEDA DE ENTRADAS (Si no hay posición activa) ---
            if (lastEntryPrice === 0) {
                // Traducción robusta del símbolo
                let SYMBOL = bot.config?.symbol || 'BTC_USDT';
                if (!SYMBOL.includes('_')) {
                    SYMBOL = SYMBOL.replace('USDT', '_USDT');
                }

                const marketData = await MarketSignal.findOne({ symbol: SYMBOL }).lean();
                
                // 2. Validación y Feedback dinámico de sincronización
                const currentCount = marketData?.history?.length || 0;
                const REQUIRED_SAMPLES = 200;

                if (!marketData || marketData.history.length < REQUIRED_SAMPLES) {
    const currentCount = marketData?.history?.length || 0;
    const progress = currentCount / REQUIRED_SAMPLES;
    
    this._log(
        userId, 
        `Colectando datos: ${currentCount}/${REQUIRED_SAMPLES} velas...`, 
        progress, 
        true
    );
    return;
}

                // 3. Ejecución si tenemos los datos completos
                // Enviamos un pequeño log de "Calculando..." antes de ejecutar
                this._log(userId, "AI Engine: Calculating Prediction...", 0.9, true);
                
                await this._executeStrategy(userId, price, marketData.history, bot);
            }
        } catch (error) {
            console.error(`❌ AI Engine Error (User: ${userId}):`, error);
        }
    }

    async _executeStrategy(userId, price, history, bot) {
        // 1. Cálculo de indicadores a través del StrategyManager
        const analysis = StrategyManager.calculate(history);
        
        if (!analysis) {
            this._log(userId, "AI Engine: Waiting for technical indicators...", 0.5, true);
            return;
        }

        const { confidence, message, trend, rsi } = analysis;
        
        // 2. LÓGICA DE DECISIÓN (ENTRADA)
        // Umbral de confianza del 75% para comprar
        if (confidence >= 0.75) {
            this._log(userId, `🚀 AI Signal: ${message} (${(confidence * 100).toFixed(0)}%). Buying...`, confidence);
            await this._trade(userId, 'BUY', price, confidence, bot);
            return;
        }

        // 3. FEEDBACK CUANDO NO HAY SEÑAL (WAITING STATE)
        // En lugar de un random del 90%, actualizamos el mensaje si hay cambios significativos 
        // o para mostrar los indicadores actuales al usuario.
        
        const rsiValue = rsi ? rsi.toFixed(2) : 'N/A';
        const statusMsg = `AI Watching: ${trend || 'Neutral'} (RSI: ${rsiValue}) - Conf: ${(confidence * 100).toFixed(0)}%`;

        // Enviamos el log con flag 'isAnalyzing: true' para que el botón muestre este texto
        // pero mantenga el spinner o estado de análisis.
        this._log(userId, statusMsg, confidence, true);
    }

    async _trade(userId, side, price, confidence, bot) {
        try {
            // Aseguramos que el balance nunca sea NaN
            const currentBalance = parseFloat(bot.aibalance || bot.config?.ai?.amountUsdt || 100);
            const fee = currentBalance * this.EXCHANGE_FEE;
            
            let newBalance = currentBalance;
            let nextEntryPrice = 0;
            let nextHighestPrice = 0;
            let netProfit = 0;

            if (side === 'BUY') {
                nextEntryPrice = price;
                nextHighestPrice = price;
                newBalance = parseFloat((currentBalance - fee).toFixed(2));
            } else {
                const profitFactor = (price / bot.ailastEntryPrice);
                netProfit = (currentBalance * (profitFactor - 1)) - fee;
                newBalance = parseFloat((currentBalance + netProfit).toFixed(2));
            }

            const stopAtCycle = bot.config?.ai?.stopAtCycle || false;
            const shouldStop = side === 'SELL' && stopAtCycle;
            const newState = shouldStop ? 'STOPPED' : 'RUNNING';

            // Actualización de la base de datos
            await Autobot.updateOne({ userId }, { 
                $set: {
                    aibalance: newBalance,
                    ailastEntryPrice: nextEntryPrice,
                    aihighestPrice: nextHighestPrice,
                    aistate: newState,
                    'config.ai.enabled': !shouldStop
                },
                $inc: { total_profit: side === 'SELL' ? parseFloat(netProfit.toFixed(4)) : 0 }
            });

            // Registro de orden
            const orderData = {
                userId,
                strategy: 'ai',
                executionMode: 'SIMULATED',
                orderId: `ai_${Date.now()}`,
                side,
                price,
                size: parseFloat((currentBalance / price).toFixed(6)),
                notional: currentBalance,
                status: 'FILLED',
                orderTime: new Date()
            };

            await Order.create(orderData);

            // Notificaciones en tiempo real
            this._broadcastStatus(userId, {
                aistate: newState,
                virtualBalance: newBalance,
                lastEntryPrice: nextEntryPrice
            });

            if (this.io) {
                this.io.to(userId.toString()).emit('ai-order-executed', orderData);
            }

        } catch (error) {
            console.error(`❌ AI Trade Error:`, error);
        }
    }

    _broadcastStatus(userId, data) {
        if (this.io) {
            this.io.to(userId.toString()).emit('ai-status-update', data);
        }
    }

    _log(userId, msg, conf, isAnalyzing = false) {
        if (this.io) {
            this.io.to(userId.toString()).emit('ai-decision-update', { 
                confidence: conf, 
                message: msg, 
                isAnalyzing 
            });
        }
    }
}

module.exports = new AIEngine();