/**
 * BSB/server/controllers/aiController.js
 * CONTROLADOR MAESTRO - VERSIÓN BLINDADA (Sincronización Total)
 */

const aiEngine = require('../src/ai/AIEngine'); 
const Order = require('../models/Order'); 
const Autobot = require('../models/Autobot');
const MarketSignal = require('../models/MarketSignal');

/**
 * Obtiene el estado actual de la IA
 */
const getAIStatus = async (req, res) => {
    const userId = req.user.id;
    try {
        const bot = await Autobot.findOne({ userId }).lean();
        
        // Obtenemos el conteo REAL de velas del mercado
        const marketData = await MarketSignal.findOne({ symbol: 'BTC_USDT' }).select('history');
        const candleCount = marketData?.history?.length || 0;

        const recentTrades = await Order.find({ userId, strategy: 'ai' })
            .sort({ orderTime: -1 })
            .limit(10);

        res.json({
            success: true,
            isRunning: bot?.aistate === 'RUNNING',
            aistate: bot?.aistate || 'STOPPED', 
            virtualBalance: bot?.aibalance || 0,
            historyCount: candleCount, 
            recentHistory: recentTrades, 
            config: {
                amountUsdt: bot?.config?.ai?.amountUsdt || 0,
                stopAtCycle: bot?.config?.ai?.stopAtCycle || false
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Activa o desactiva el motor de IA con notificación inmediata al motor
 */
const toggleAI = async (req, res) => {
    const userId = req.user.id;
    const { action } = req.body; 
    
    try {
        if (!action) return res.status(400).json({ success: false, message: "Acción no proporcionada" });

        const newState = action === 'start' ? 'RUNNING' : 'STOPPED';
        const isEnabled = action === 'start';

        // 1. Actualización en Base de Datos
        const updatedBot = await Autobot.findOneAndUpdate(
            { userId },
            { 
                $set: { 
                    aistate: newState,
                    'config.ai.enabled': isEnabled,
                    ...(action !== 'start' && { ailastEntryPrice: 0 })
                } 
            },
            { new: true, lean: true }
        );

        if (!updatedBot) return res.status(404).json({ success: false, message: "Bot no encontrado" });

        // 2. SINCRONIZACIÓN MANUAL: 
        // Forzamos un log inmediato a través del motor para que el WebSocket 
        // emita el estado de "Analizando" antes de que el frontend dude.
        if (isEnabled && aiEngine && aiEngine._log) {
            aiEngine._log(userId, "Iniciando Motor Neural...", 0.01, true);
        }

        const marketData = await MarketSignal.findOne({ symbol: 'BTC_USDT' }).select('history');

        res.json({ 
            success: true, 
            isRunning: isEnabled,
            aistate: newState,
            virtualBalance: updatedBot.aibalance,
            historyCount: marketData?.history?.length || 0,
            message: isEnabled ? "Motor Neural Activado" : "Motor Neural Detenido" 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Cierre de Emergencia
 */
const panicSell = async (req, res) => {
    const userId = req.user.id;
    try {
        await Autobot.updateOne({ userId }, { $set: { aistate: 'STOPPED', 'config.ai.enabled': false, ailastEntryPrice: 0 } });
        
        // Notificamos al motor que se detenga inmediatamente si hay procesos pendientes
        if (aiEngine && aiEngine._broadcastStatus) {
            aiEngine._broadcastStatus(userId, { aistate: 'STOPPED' });
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
 * Historial completo
 */
const getVirtualHistory = async (req, res) => {
    const userId = req.user.id;
    try {
        const history = await Order.find({ userId, strategy: 'ai' })
            .sort({ orderTime: -1 })
            .limit(50); 
            
        res.json({ success: true, data: history });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Actualiza la configuración IA
 */
const updateAIConfig = async (req, res) => {
    const userId = req.user.id;
    const { amountUsdt, stopAtCycle } = req.body;
    const updateFields = {};

    try {
        if (amountUsdt !== undefined) {
            updateFields['config.ai.amountUsdt'] = parseFloat(amountUsdt);
            updateFields.aibalance = parseFloat(amountUsdt);
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
            message: "Configuración Neural Sincronizada"
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { getAIStatus, toggleAI, panicSell, getVirtualHistory, updateAIConfig };