/**
 * BSB/server/controllers/aiController.js
 * CONTROLADOR MAESTRO - VERSIÓN SINCRONIZADA (Velas vs Órdenes)
 */

const aiEngine = require('../src/ai/AIEngine'); 
const Order = require('../models/Order'); 
const Autobot = require('../models/Autobot');
const MarketSignal = require('../models/MarketSignal'); // <--- IMPORTANTE

/**
 * Obtiene el estado actual de la IA
 */
const getAIStatus = async (req, res) => {
    const userId = req.user.id;
    try {
        const bot = await Autobot.findOne({ userId }).lean();
        
        // 1. Obtenemos el conteo REAL de velas del mercado
        const marketData = await MarketSignal.findOne({ symbol: 'BTC_USDT' }).select('history');
        const candleCount = marketData?.history?.length || 0;

        const recentTrades = await Order.find({ userId, strategy: 'ai' })
            .sort({ orderTime: -1 })
            .limit(10);

        const isRunning = bot?.aistate === 'RUNNING';

        res.json({
            success: true,
            isRunning: isRunning,
            aistate: bot?.aistate || 'STOPPED', 
            virtualBalance: bot?.aibalance || 0,
            // CLAVE: Enviamos el conteo de velas para que el botón sepa que hay datos técnicos
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
 * Activa o desactiva el motor de IA
 */
const toggleAI = async (req, res) => {
    const userId = req.user.id;
    const { action } = req.body; 
    
    try {
        if (!action) return res.status(400).json({ success: false, message: "Acción no proporcionada" });

        const newState = action === 'start' ? 'RUNNING' : 'STOPPED';
        const isEnabled = action === 'start';

        const updatedBot = await Autobot.findOneAndUpdate(
            { userId },
            { 
                $set: { 
                    aistate: newState,
                    'config.ai.enabled': isEnabled,
                    ...(action !== 'start' && { ailastEntryPrice: 0 })
                } 
            },
            { new: true }
        );

        if (!updatedBot) return res.status(404).json({ success: false, message: "Bot no encontrado" });

        // Al arrancar, también devolvemos el conteo de velas para refrescar la UI
        const marketData = await MarketSignal.findOne({ symbol: 'BTC_USDT' }).select('history');

        res.json({ 
            success: true, 
            isRunning: isEnabled,
            aistate: newState,
            virtualBalance: updatedBot.aibalance,
            historyCount: marketData?.history?.length || 0, // <--- REFREZCO DE UI
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
            { new: true }
        );

        res.json({
            success: true,
            isRunning: updatedBot.aistate === 'RUNNING',
            virtualBalance: updatedBot.aibalance,
            stopAtCycle: updatedBot.config.ai.stopAtCycle,
            message: "Configuración Neural Sincronizada"
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { getAIStatus, toggleAI, panicSell, getVirtualHistory, updateAIConfig };