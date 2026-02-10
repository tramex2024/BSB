// BSB/server/src/au/engines/AIEngine.js

const Autobot = require('../../models/Autobot');
const Order = require('../../models/Order'); 
const MarketSignal = require('../../models/MarketSignal'); 
const StrategyManager = require('./StrategyManager');

/**
 * AI Engine - Motor de Decisiones Neuronales (BSB 2026)
 * Maneja lógica de Trailing Stop virtual y señales de alta confianza.
 */
class AIEngine {
    constructor() {
        this.io = null;
        this.TRAILING_PERCENT = 0.005; // 0.5% de retroceso para cerrar
        this.EXCHANGE_FEE = 0.001;     // 0.1% comisión estimada
    }

    /**
     * Inyecta la instancia de Socket.io para comunicación en tiempo real
     */
    setIo(io) {
        this.io = io;
    }

    /**
     * Punto de entrada principal: Analiza el precio actual para un usuario específico
     */
    async analyze(price, userId) {
        if (!userId || !price) return;

        try {
            // Buscamos el estado del bot (usamos lean para lectura rápida)
            const bot = await Autobot.findOne({ userId }).lean();
            
            // Verificaciones de seguridad: El bot debe existir y la IA estar en RUNNING
            if (!bot || bot.aistate !== 'RUNNING' || !bot.config?.ai?.enabled) return;

            const lastEntryPrice = bot.ailastEntryPrice || 0;
            let highestPrice = bot.aihighestPrice || 0;

            // --- 1. GESTIÓN DE POSICIÓN ABIERTA (Trailing Stop) ---
            if (lastEntryPrice > 0) {
                // Actualizar el precio máximo alcanzado para el Trailing Stop
                if (price > highestPrice) {
                    highestPrice = price;
                    await Autobot.updateOne({ userId }, { $set: { aihighestPrice: highestPrice } });
                }

                const stopPrice = highestPrice * (1 - this.TRAILING_PERCENT);
                
                // Si el precio cae por debajo del stop loss dinámico
                if (price <= stopPrice) {
                    this._log(userId, `🎯 AI: Trailing Stop activado. Salida @ $${price.toFixed(2)}`, 0.95);
                    await this._trade(userId, 'SELL', price, 1.0, bot);
                    return; 
                }
            }

            // --- 2. BÚSQUEDA DE ENTRADAS (Si no hay posición activa) ---
            if (lastEntryPrice === 0) {
                const SYMBOL = bot.config?.symbol || 'BTC_USDT';
                const marketData = await MarketSignal.findOne({ symbol: SYMBOL }).lean();
                
                if (marketData && marketData.history && marketData.history.length >= 50) {
                    await this._executeStrategy(userId, price, marketData.history, bot);
                } else if (Math.random() > 0.98) {
                    // Log cosmético para feedback en el Dashboard
                    this._log(userId, "Calibrando sensores neuronales...", 0.1, true);
                }
            }
        } catch (error) {
            console.error(`❌ AI Engine Error (User: ${userId}):`, error);
        }
    }

    /**
     * Ejecuta los cálculos técnicos a través del StrategyManager
     */
    async _executeStrategy(userId, price, history, bot) {
        const analysis = StrategyManager.calculate(history);
        if (!analysis) return;

        const { confidence, message } = analysis;
        
        // Umbral de confianza del 75% para entrar al mercado
        if (confidence >= 0.75) {
            this._log(userId, `🚀 AI: Señal de alta confianza (${(confidence * 100).toFixed(0)}%). Entrando...`, confidence);
            await this._trade(userId, 'BUY', price, confidence, bot);
        } else if (Math.random() > 0.95) {
            // Reportamos el análisis actual aunque no sea entrada
            this._log(userId, message, confidence);
        }
    }

    /**
     * Ejecuta la transacción (Simulada para Paper Trading)
     */
    async _trade(userId, side, price, confidence, bot) {
        try {
            const currentBalance = parseFloat(bot.aibalance || bot.config.ai?.amountUsdt || 100);
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
                // Cálculo de profit basado en el precio de entrada anterior
                const profitFactor = (price / bot.ailastEntryPrice);
                netProfit = (currentBalance * (profitFactor - 1)) - fee;
                newBalance = parseFloat((currentBalance + netProfit).toFixed(2));
            }

            const stopAtCycle = bot.config?.ai?.stopAtCycle || false;
            const shouldStop = side === 'SELL' && stopAtCycle;
            const newState = shouldStop ? 'STOPPED' : 'RUNNING';

            // --- ACTUALIZACIÓN ATÓMICA ---
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

            // --- PERSISTENCIA EN HISTORIAL ---
            const orderData = {
                userId,
                strategy: 'ai',
                executionMode: 'SIMULATED',
                orderId: `ai_${userId.toString().slice(-4)}_${Date.now()}`,
                side,
                price,
                size: parseFloat((currentBalance / price).toFixed(6)),
                notional: currentBalance,
                status: 'FILLED',
                orderTime: new Date()
            };

            await Order.create(orderData);

            // Notificar cambios de estado generales
            this._broadcastStatus(userId, {
                aistate: newState,
                virtualBalance: newBalance,
                lastEntryPrice: nextEntryPrice,
                netProfit: side === 'SELL' ? netProfit : 0
            });

            // Actualizar historial del frontend inmediatamente
            if (this.io) {
                this.io.to(userId.toString()).emit('ai-order-executed', orderData);
            }

        } catch (error) {
            console.error(`❌ AI Trade Error (User: ${userId}):`, error);
        }
    }

    /**
     * Emite el estado del bot al usuario por su sala privada de Socket.io
     */
    _broadcastStatus(userId, data) {
        if (this.io) {
            // NOTA: Usamos userId.toString() para coincidir con la sala de server.js
            this.io.to(userId.toString()).emit('ai-status-update', data);
        }
    }

    /**
     * Envía logs de decisión a la interfaz para que el usuario vea qué piensa la IA
     */
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