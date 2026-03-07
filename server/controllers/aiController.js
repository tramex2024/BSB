/**
 * BSB/server/controllers/aiController.js
 * CONTROLADOR MAESTRO - VERSIÓN BLINDADA (Sincronización Total)
 */

const aiEngine = require('../src/ai/AIEngine'); // Ruta corregida a la arquitectura AU
const Order = require('../models/Order'); 
const Autobot = require('../models/Autobot');
const MarketSignal = require('../models/MarketSignal');
const { processAIInputs } = require('../services/inputs');

/**
 * Obtiene el estado actual de la IA para el Dashboard
 */
const getAIStatus = async (req, res) => {
    const userId = req.user.id;
    try {
        const bot = await Autobot.findOne({ userId }).lean();
        if (!bot) return res.status(404).json({ success: false, message: "Bot no encontrado" });

        const symbol = bot.config?.symbol || 'BTC_USDT';
        // Buscamos cuántas velas tenemos para informar al usuario sobre la precisión del análisis
        const marketData = await MarketSignal.findOne({ symbol }).select('history').lean();
        const candleCount = marketData?.history?.length || 0;

        const recentTrades = await Order.find({ userId, strategy: 'ai' })
            .sort({ orderTime: -1 })
            .limit(10)
            .lean();

        res.json({
            success: true,
            isRunning: bot.aistate === 'RUNNING',
            aistate: bot.aistate || 'STOPPED', 
            virtualBalance: bot.aibalance || 0,
            ailastEntryPrice: bot.ailastEntryPrice || 0,
            historyCount: candleCount, 
            recentHistory: recentTrades, 
            config: {
                amountUsdt: bot.config?.ai?.amountUsdt || 0,
                stopAtCycle: bot.config?.ai?.stopAtCycle || false
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Activa o desactiva el motor de IA
 */
const toggleAI = async (req, res) => {
    const userId = req.user.id;
    const { action } = req.body; 
    
    try {
        if (!action) return res.status(400).json({ success: false, message: "Acción no proporcionada" });

        const isStarting = action === 'start';
        const newState = isStarting ? 'RUNNING' : 'STOPPED';

        // 1. Actualización en Base de Datos
        // Al apagar, limpiamos precios de tracking (entry y highest)
        const updateQuery = { 
            aistate: newState,
            'config.ai.enabled': isStarting
        };

        if (!isStarting) {
            updateQuery.ailastEntryPrice = 0;
            updateQuery.aihighestPrice = 0;
        }

        const updatedBot = await Autobot.findOneAndUpdate(
            { userId },
            { $set: updateQuery },
            { new: true, lean: true }
        );

        if (!updatedBot) return res.status(404).json({ success: false, message: "Bot no encontrado" });

        // 2. Notificación Inmediata vía WebSocket
        if (isStarting && aiEngine && typeof aiEngine._log === 'function') {
            aiEngine._log(userId, "🚀 Iniciando Motor Neural...", 0.01, true);
        } else {
            aiEngine._broadcastStatus(userId, { aistate: 'STOPPED', virtualBalance: updatedBot.aibalance });
        }

        res.json({ 
            success: true, 
            isRunning: isStarting,
            aistate: newState,
            virtualBalance: updatedBot.aibalance,
            message: isStarting ? "Motor Neural Activado" : "Motor Neural Detenido" 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Cierre de Emergencia (Panic Sell Virtual)
 */
const panicSell = async (req, res) => {
    const userId = req.user.id;
    try {
        const bot = await Autobot.findOneAndUpdate(
            { userId }, 
            { 
                $set: { 
                    aistate: 'STOPPED', 
                    'config.ai.enabled': false, 
                    ailastEntryPrice: 0,
                    aihighestPrice: 0
                } 
            },
            { new: true }
        );
        
        if (aiEngine && typeof aiEngine._broadcastStatus === 'function') {
            aiEngine._broadcastStatus(userId, { aistate: 'STOPPED', virtualBalance: bot.aibalance });
            aiEngine._log(userId, "🚨 CIERRE DE EMERGENCIA EJECUTADO", 0, false);
        }

        res.json({
            success: true,
            message: "Posiciones cerradas y motor detenido",
            isRunning: false
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Actualiza la configuración de capital de la IA
 */
const updateAIConfig = async (req, res) => {
    const userId = req.user.id;
    const { amountUsdt, stopAtCycle } = req.body;
    const updateFields = {};

    try {
        const currentBot = await Autobot.findOne({ userId }).select('aistate aibalance').lean();
        
        if (amountUsdt !== undefined) {
            // 1. Procesamos el input a través de nuestra nueva función estandarizada
            const processed = processAIInputs(amountUsdt);
            const val = processed.amountUsdt;
            
            updateFields['config.ai.amountUsdt'] = val;
            
            // 2. Aplicamos el criterio de "STOPPED" (Paso 2: Consistencia)
            // Solo actualizamos el balance operativo si el motor está detenido
            if (currentBot?.aistate === 'STOPPED') {
                updateFields.aibalance = val;
            }
        }

        if (stopAtCycle !== undefined) {
            updateFields['config.ai.stopAtCycle'] = !!stopAtCycle;
        }

        const updatedBot = await Autobot.findOneAndUpdate(
            { userId }, 
            { $set: updateFields }, 
            { new: true, lean: true }
        );

        res.json({
            success: true,
            isRunning: updatedBot.aistate === 'RUNNING',
            virtualBalance: updatedBot.aibalance,
            stopAtCycle: updatedBot.config?.ai?.stopAtCycle,
            message: currentBot?.aistate === 'STOPPED' 
                ? "Configuración y Balance Neural Sincronizados" 
                : "Configuración actualizada (Balance se ajustará al detener el bot)"
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { 
    getAIStatus, 
    toggleAI, 
    panicSell, 
    getVirtualHistory: async (req, res) => {
        try {
            const history = await Order.find({ userId: req.user.id, strategy: 'ai' })
                .sort({ orderTime: -1 }).limit(50).lean();
            res.json({ success: true, data: history });
        } catch (e) { res.status(500).json({ success: false, error: e.message }); }
    }, 
    updateAIConfig 
};