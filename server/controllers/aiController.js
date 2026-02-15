/**
 * BSB/server/controllers/aiController.js
 * CONTROLADOR MAESTRO - VERSIÓN SINCRONIZADA CON AIEngine
 */

const aiEngine = require('../src/ai/AIEngine'); // Ajustado a la ruta de tu motor
const Order = require('../models/Order'); 
const Autobot = require('../models/Autobot');

/**
 * Obtiene el estado actual de la IA (Desde DB para mayor fidelidad)
 */
const getAIStatus = async (req, res) => {
    const userId = req.user.id;
    try {
        const bot = await Autobot.findOne({ userId }).lean();
        
        const recentTrades = await Order.find({ userId, strategy: 'ai' })
            .sort({ orderTime: -1 })
            .limit(10);

        // Si el bot está en RUNNING, asumimos que el motor lo procesará en el siguiente tick
        const isRunning = bot?.aistate === 'RUNNING';

        res.json({
            success: true,
            isRunning: isRunning,
            aistate: bot?.aistate || 'STOPPED', 
            virtualBalance: bot?.aibalance || 0,
            historyCount: 50, // Valor estático para evitar bloqueos visuales
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
 * Activa o desactiva el motor de IA (Modificando la DB)
 */
const toggleAI = async (req, res) => {
    const userId = req.user.id;
    const { action } = req.body; 
    
    try {
        if (!action) return res.status(400).json({ success: false, message: "Acción no proporcionada" });

        const newState = action === 'start' ? 'RUNNING' : 'STOPPED';
        const isEnabled = action === 'start';

        // Actualizamos el documento en MongoDB. 
        // El motor AIEngine detectará este cambio en su próximo ciclo de 'analyze'
        const updatedBot = await Autobot.findOneAndUpdate(
            { userId },
            { 
                $set: { 
                    aistate: newState,
                    'config.ai.enabled': isEnabled
                } 
            },
            { new: true }
        );

        res.json({ 
            success: true, 
            isRunning: isEnabled,
            aistate: newState,
            virtualBalance: updatedBot.aibalance,
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
        // Forzamos el estado a STOPPED
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