/**
 * Archivo: server/controllers/aiController.js
 * Controlador maestro para la gestión de la IA y Órdenes Integradas
 */

const aiEngine = require('../src/ai/AIEngine'); 
const Order = require('../models/Order');      // 👈 Cambiado
const Autobot = require('../models/Autobot');  // 👈 Cambiado

/**
 * Obtiene el estado actual de la IA desde el modelo unificado
 */
const getAIStatus = async (req, res) => {
    try {
        const bot = await Autobot.findOne({}).lean();
        const recentTrades = await Order.find({ strategy: 'ai' }).sort({ orderTime: -1 }).limit(10);

        res.json({
            success: true,
            isRunning: aiEngine.isRunning,
            // AGREGAMOS ESTO PARA EL FRONTEND:
            aistate: aiEngine.isRunning ? 'RUNNING' : 'STOPPED', 
            virtualBalance: aiEngine.virtualBalance || (bot ? bot.aibalance : 0),
            // CAMBIO AQUÍ: Usar aibalance para que coincida con el modelo
            virtualBalance: aiEngine.virtualBalance || (bot ? bot.aibalance : 0),
            historyCount: aiEngine.history ? aiEngine.history.length : 0,
            recentHistory: recentTrades, 
            config: {
                amountUsdt: bot?.config?.ai?.amountUsdt || 0,
                stopAtCycle: aiEngine.stopAtCycle 
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Activa o desactiva el motor de IA (vía AIEngine)
 */
const toggleAI = async (req, res) => {
    try {
        const { action } = req.body; 
        if (!action) return res.status(400).json({ success: false, message: "Acción no proporcionada" });

        const result = await aiEngine.toggle(action);

        res.json({ 
            success: true, 
            isRunning: result.isRunning,
            aistate: result.isRunning ? 'RUNNING' : 'STOPPED',
            virtualBalance: result.virtualBalance,
            message: result.isRunning ? "IA Activada" : "IA Detenida" 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Cierre de Emergencia
 */
const panicSell = async (req, res) => {
    try {
        const result = await aiEngine.panicSell();
        res.json({
            success: true,
            message: result.message,
            isRunning: aiEngine.isRunning
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Historial completo filtrado por estrategia AI
 */
const getVirtualHistory = async (req, res) => {
    try {
        const history = await Order.find({ strategy: 'ai' })
            .sort({ orderTime: -1 })
            .limit(50); 
            
        res.json({ success: true, data: history });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Actualiza la configuración en la rama AI del Autobot
 */
const updateAIConfig = async (req, res) => {
    try {
        const { amountUsdt, stopAtCycle } = req.body;
        const updateFields = {};

        if (amountUsdt !== undefined) {
            const parsedAmount = parseFloat(amountUsdt);
            updateFields['config.ai.amountUsdt'] = parsedAmount;
            
            if (!aiEngine.isRunning) {
                updateFields.aibalance = parsedAmount;
                aiEngine.virtualBalance = parsedAmount;
            }
        }

        if (stopAtCycle !== undefined) {
            updateFields['config.ai.stopAtCycle'] = !!stopAtCycle;
            aiEngine.stopAtCycle = !!stopAtCycle;
        }

        const updatedBot = await Autobot.findOneAndUpdate(
            {}, 
            { $set: updateFields }, 
            { new: true }
        );

        if (aiEngine._broadcastStatus) aiEngine._broadcastStatus();

        res.json({
            success: true,
            isRunning: aiEngine.isRunning,
            virtualBalance: aiEngine.virtualBalance,
            stopAtCycle: updatedBot.config.ai.stopAtCycle,
            message: "Configuración Neural Sincronizada"
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { getAIStatus, toggleAI, panicSell, getVirtualHistory, updateAIConfig };