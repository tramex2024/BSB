/**
 * Archivo: BSB/server/controllers/aiController.js
 * Controlador unificado - Confianza en la instancia del Engine
 */

const path = require('path');
const aiEngine = require(path.join(__dirname, '..', 'src', 'ai', 'AIEngine'));
const AIBotOrder = require('../models/AIBotOrder');
const Aibot = require('../models/Aibot'); 

/**
 * Obtiene el estado actual de la IA (Desde el Engine y DB)
 */
const getAIStatus = async (req, res) => {
    try {
        // Obtenemos el estado más fresco directamente de la instancia en memoria
        // que es la que está corriendo en el botCycle
        res.json({
            success: true,
            isRunning: aiEngine.isRunning,
            isVirtual: aiEngine.IS_VIRTUAL_MODE,
            virtualBalance: aiEngine.virtualBalance,
            historyCount: aiEngine.history.length,
            lastEntryPrice: aiEngine.lastEntryPrice,
            config: {
                risk: aiEngine.RISK_PER_TRADE,
                trailing: aiEngine.TRAILING_PERCENT,
                threshold: 0.7 
            }
        });
    } catch (error) {
        console.error("Error en getAIStatus:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Activa o desactiva el motor de IA
 */
const toggleAI = async (req, res) => {
    try {
        const { action } = req.body; 
        
        if (!action) {
            return res.status(400).json({ success: false, message: "Acción no proporcionada" });
        }

        // Delegamos TODA la responsabilidad al Engine.
        // Él ya sabe cómo actualizar la DB, emitir sockets y limpiar su historial.
        const result = await aiEngine.toggle(action);
        
        res.json({ 
            success: true, 
            isRunning: result.isRunning,
            virtualBalance: result.virtualBalance,
            message: result.isRunning ? "IA Activada - Analizando mercado" : "IA Detenida" 
        });
    } catch (error) {
        console.error("Error en toggleAI:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Obtiene el historial de órdenes
 */
const getVirtualHistory = async (req, res) => {
    try {
        const history = await AIBotOrder.find({ isVirtual: true })
            .sort({ timestamp: -1 })
            .limit(30); 
            
        res.json({ success: true, data: history });
    } catch (error) {
        console.error("Error en getVirtualHistory:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = {
    getAIStatus,
    toggleAI,
    getVirtualHistory
};