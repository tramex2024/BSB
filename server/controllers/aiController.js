// BSB/server/controllers/aiController.js


const aiEngine = require('../src/ai/aiEngine');
const AIBotOrder = require('../models/AIBotOrder');
const Autobot = require('../models/Autobot');

/**
 * Obtiene el estado actual de la IA (Saldo, si está corriendo, config)
 */
const getAIStatus = async (req, res) => {
    try {
        const state = await Autobot.findOne({});
        
        res.json({
            success: true,
            isRunning: aiEngine.isRunning,
            isVirtual: aiEngine.IS_VIRTUAL_MODE,
            virtualBalance: aiEngine.virtualBalance || state?.virtualAiBalance || 1000.00,
            config: {
                risk: aiEngine.RISK_PER_TRADE,
                trailing: aiEngine.TRAILING_PERCENT,
                threshold: aiEngine.CONFIDENCE_THRESHOLD || 0.7 
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
        const { action } = req.body; // 'start' o 'stop'
        
        if (!action) {
            return res.status(400).json({ success: false, message: "Acción no proporcionada" });
        }

        // Usamos el método interno del motor
        const result = aiEngine.toggle(action);
        
        // Si arrancamos, inicializamos balance y configuración
        if (result.isRunning) {
            await aiEngine.init();
        }

        res.json({ 
            success: true, 
            isRunning: result.isRunning,
            virtualBalance: result.virtualBalance,
            message: result.isRunning ? "IA Activada - Escaneando Mercado" : "IA Detenida" 
        });
    } catch (error) {
        console.error("Error en toggleAI:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Obtiene el historial de órdenes virtuales de la base de datos
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

// --- EXPORTACIÓN ROBUSTA ---
// Esto asegura que al importar el archivo en aiRoutes.js, 
// las funciones no lleguen como 'undefined'.
module.exports = {
    getAIStatus,
    toggleAI,
    getVirtualHistory
};