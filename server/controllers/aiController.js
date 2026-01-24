// BSB/server/controllers/aiController.js


const aiEngine = require('../src/ai/aiEngine');
const AIBotOrder = require('../models/AIBotOrder');
const Autobot = require('../models/Autobot');

exports.getAIStatus = async (req, res) => {
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
                // Si aún no defines CONFIDENCE_THRESHOLD en el constructor de aiEngine, 
                // asegúrate de agregarlo o usar un valor por defecto.
                threshold: aiEngine.CONFIDENCE_THRESHOLD || 0.7 
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.toggleAI = async (req, res) => {
    try {
        const { action } = req.body; // Se espera 'start' o 'stop'
        
        // Usamos el método interno del motor para mantener la coherencia de logs
        const result = aiEngine.toggle(action);
        
        // Si arrancamos, nos aseguramos de que el balance esté fresco desde la DB
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
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.getVirtualHistory = async (req, res) => {
    try {
        const history = await AIBotOrder.find({ isVirtual: true })
            .sort({ timestamp: -1 })
            .limit(30); // Subimos a 30 para tener una gráfica más rica
        res.json({ success: true, data: history });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};