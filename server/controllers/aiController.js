/**
 * Archivo: BSB/server/controllers/aiController.js
 * Versión: Presupuesto Dinámico 2026
 */
const path = require('path');
const aiEngine = require('../src/ai/AIEngine'); 
const AIBotOrder = require('../models/AIBotOrder');
const Aibot = require('../models/Aibot'); 

const getAIStatus = async (req, res) => {
    try {
        const recentTrades = await AIBotOrder.find({ isVirtual: true })
            .sort({ timestamp: -1 })
            .limit(5);

        res.json({
            success: true,
            isRunning: aiEngine.isRunning,
            virtualBalance: aiEngine.virtualBalance,
            historyCount: aiEngine.history ? aiEngine.history.length : 0,
            recentHistory: recentTrades, 
            config: {
                risk: aiEngine.RISK_PER_TRADE || 0.1,
                threshold: 0.85
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const toggleAI = async (req, res) => {
    try {
        const { action, budget } = req.body; // <--- Ahora recibimos el budget del frontend
        
        if (!action) {
            return res.status(400).json({ success: false, message: "Acción no proporcionada" });
        }

        console.log(`[AI-CONTROLLER] Comando: ${action}${action === 'start' ? ` con Budget: $${budget}` : ''}`);

        // Validación de presupuesto solo al encender
        let numericBudget = null;
        if (action === 'start') {
            numericBudget = parseFloat(budget);
            if (!numericBudget || numericBudget <= 0) {
                return res.status(400).json({ success: false, message: "Presupuesto inicial requerido" });
            }
        }

        // 1. Pasamos el presupuesto al Engine.toggle
        // Nota: Asegúrate de que aiEngine.toggle(action, budget) esté preparado para recibirlo
        await aiEngine.toggle(action, numericBudget);
        
        // 2. Seguridad redundante
        if (action === 'stop') aiEngine.isRunning = false;

        res.json({ 
            success: true, 
            isRunning: aiEngine.isRunning,
            virtualBalance: aiEngine.virtualBalance,
            message: aiEngine.isRunning ? `IA Activada con $${aiEngine.virtualBalance}` : "IA Detenida" 
        });
    } catch (error) {
        console.error("Error en toggleAI:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

const getVirtualHistory = async (req, res) => {
    try {
        const history = await AIBotOrder.find({ isVirtual: true })
            .sort({ timestamp: -1 })
            .limit(30); 
            
        res.json({ success: true, data: history });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { getAIStatus, toggleAI, getVirtualHistory };