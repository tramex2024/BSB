/**
 * BSB/server/controllers/aiController.js
 * CONTROLADOR MAESTRO PARA LA GESTIÓN DE LA IA MULTIUSUARIO
 */

const aiEngine = require('../src/ai/AIEngine'); // Se asume que aiEngine maneja estados por userId
const Order = require('../models/Order'); 
const Autobot = require('../models/Autobot');

/**
 * Obtiene el estado actual de la IA para el usuario autenticado
 */
const getAIStatus = async (req, res) => {
    const userId = req.user.id;
    try {
        const bot = await Autobot.findOne({ userId }).lean();
        
        // Buscamos solo órdenes de IA pertenecientes a este usuario
        const recentTrades = await Order.find({ userId, strategy: 'ai' })
            .sort({ orderTime: -1 })
            .limit(10);

        // Obtenemos el estado en memoria de la IA para este usuario
        const engineState = aiEngine.getUserState(userId); 

        res.json({
            success: true,
            isRunning: engineState.isRunning,
            aistate: engineState.isRunning ? 'RUNNING' : 'STOPPED', 
            virtualBalance: engineState.virtualBalance || (bot ? bot.aibalance : 0),
            historyCount: engineState.historyCount || 0,
            recentHistory: recentTrades, 
            config: {
                amountUsdt: bot?.config?.ai?.amountUsdt || 0,
                stopAtCycle: engineState.stopAtCycle 
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Activa o desactiva el motor de IA del usuario
 */
const toggleAI = async (req, res) => {
    const userId = req.user.id;
    const { action } = req.body; 
    
    try {
        if (!action) return res.status(400).json({ success: false, message: "Acción no proporcionada" });

        // El motor ahora recibe el userId y las credenciales (inyectadas por middleware)
        const result = await aiEngine.toggle(userId, action, req.bitmartCreds);

        res.json({ 
            success: true, 
            isRunning: result.isRunning,
            aistate: result.isRunning ? 'RUNNING' : 'STOPPED',
            virtualBalance: result.virtualBalance,
            message: result.isRunning ? "Motor Neural Activado" : "Motor Neural Detenido" 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Cierre de Emergencia de posiciones IA
 */
const panicSell = async (req, res) => {
    const userId = req.user.id;
    try {
        const result = await aiEngine.panicSell(userId, req.bitmartCreds);
        res.json({
            success: true,
            message: result.message,
            isRunning: result.isRunning
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Historial completo de IA filtrado por usuario
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
 * Actualiza la configuración IA en el documento Autobot del usuario
 */
const updateAIConfig = async (req, res) => {
    const userId = req.user.id;
    const { amountUsdt, stopAtCycle } = req.body;
    const updateFields = {};

    try {
        if (amountUsdt !== undefined) {
            const parsedAmount = parseFloat(amountUsdt);
            updateFields['config.ai.amountUsdt'] = parsedAmount;
            
            // Si el motor no está corriendo, actualizamos el balance inicial
            if (!aiEngine.isUserRunning(userId)) {
                updateFields.aibalance = parsedAmount;
                aiEngine.updateVirtualBalance(userId, parsedAmount);
            }
        }

        if (stopAtCycle !== undefined) {
            updateFields['config.ai.stopAtCycle'] = !!stopAtCycle;
            aiEngine.setStopAtCycle(userId, !!stopAtCycle);
        }

        const updatedBot = await Autobot.findOneAndUpdate(
            { userId }, 
            { $set: updateFields }, 
            { new: true }
        );

        res.json({
            success: true,
            isRunning: aiEngine.isUserRunning(userId),
            virtualBalance: updatedBot.aibalance,
            stopAtCycle: updatedBot.config.ai.stopAtCycle,
            message: "Configuración Neural Sincronizada"
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { getAIStatus, toggleAI, panicSell, getVirtualHistory, updateAIConfig };