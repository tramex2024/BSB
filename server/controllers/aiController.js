// BSB/server/controllers/aiController.js


const aiEngine = require('../src/ai/aiEngine');
const AIBotOrder = require('../models/AIBotOrder');
const Autobot = require('../models/Autobot');

exports.getAIStatus = async (req, res) => {
    try {
        // Obtenemos el balance desde el motor o la DB
        const state = await Autobot.findOne({});
        
        res.json({
            isRunning: aiEngine.isRunning,
            isVirtual: aiEngine.IS_VIRTUAL_MODE, // Usamos la constante del motor
            virtualBalance: aiEngine.virtualBalance || state?.virtualAiBalance || 1000.00,
            // Enviamos los parámetros dinámicos para ver la auto-optimización en el Dashboard
            config: {
                risk: aiEngine.RISK_PER_TRADE,
                trailing: aiEngine.TRAILING_PERCENT,
                threshold: aiEngine.CONFIDENCE_THRESHOLD
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.toggleAI = async (req, res) => {
    try {
        aiEngine.isRunning = !aiEngine.isRunning;
        
        // Si se activa, sincronizamos el balance inicial
        if (aiEngine.isRunning) {
            await aiEngine.init();
        }

        console.log(`[SYSTEM] AI Engine Toggled: ${aiEngine.isRunning ? 'ON' : 'OFF'}`);
        
        res.json({ 
            success: true, 
            isRunning: aiEngine.isRunning,
            message: aiEngine.isRunning ? "IA Activada" : "IA Detenida" 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.getVirtualHistory = async (req, res) => {
    try {
        // Filtramos por isVirtual para no mezclar con trades reales del bot
        const history = await AIBotOrder.find({ isVirtual: true })
            .sort({ timestamp: -1 })
            .limit(20);
        res.json(history);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};