/**
 * Archivo: BSB/server/controllers/aiController.js
 */
const path = require('path');
// Usamos require directo para evitar problemas de caché de módulos
const aiEngine = require('../ai/AIEngine'); 
const AIBotOrder = require('../models/AIBotOrder');
const Aibot = require('../models/Aibot'); 

const getAIStatus = async (req, res) => {
    try {
        // Obtenemos los trades más recientes
        const recentTrades = await AIBotOrder.find({ isVirtual: true })
            .sort({ timestamp: -1 })
            .limit(5);

        res.json({
            success: true,
            isRunning: aiEngine.isRunning,
            virtualBalance: aiEngine.virtualBalance,
            historyCount: aiEngine.history.length,
            recentHistory: recentTrades, 
            config: {
                risk: aiEngine.RISK_PER_TRADE,
                threshold: 0.85 // Actualizado a nuestro nuevo estándar selectivo
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const toggleAI = async (req, res) => {
    try {
        const { action } = req.body; 
        
        if (!action) {
            return res.status(400).json({ success: false, message: "Acción no proporcionada" });
        }

        console.log(`[AI-CONTROLLER] Comando recibido: ${action}`);

        // Forzamos la actualización en el Engine
        const result = await aiEngine.toggle(action);
        
        // Verificación de seguridad: si mandamos parar, forzamos isRunning a false
        if (action === 'stop') aiEngine.isRunning = false;

        res.json({ 
            success: true, 
            isRunning: aiEngine.isRunning,
            virtualBalance: aiEngine.virtualBalance,
            message: aiEngine.isRunning ? "IA Activada" : "IA Detenida" 
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