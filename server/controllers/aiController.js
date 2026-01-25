// BSB/server/controllers/aiController.js

const aiEngine = require('../../src/ai/aiEngine'); // Ajusta la ruta si es necesario
const AIBotOrder = require('../models/AIBotOrder');
const Aibot = require('../models/Aibot'); // <--- Nueva Fuente de la Verdad

/**
 * Obtiene el estado actual de la IA (Desde la DB para persistencia)
 */
const getAIStatus = async (req, res) => {
    try {
        // Buscamos el estado persistente
        let state = await Aibot.findOne({});
        
        // Si no existe, lo creamos para evitar errores de null
        if (!state) {
            state = await Aibot.create({ isRunning: false, virtualBalance: 100.00 });
        }
        
        res.json({
            success: true,
            isRunning: state.isRunning, // Priorizamos lo que dice la DB
            isVirtual: aiEngine.IS_VIRTUAL_MODE,
            virtualBalance: state.virtualBalance,
            historyCount: state.historyPoints.length, // Para que el front sepa el progreso (X/30)
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
 * Activa o desactiva el motor de IA y guarda el estado
 */
const toggleAI = async (req, res) => {
    try {
        const { action } = req.body; 
        
        if (!action) {
            return res.status(400).json({ success: false, message: "Acción no proporcionada" });
        }

        // 1. Ejecutamos cambio en el motor
        const result = await aiEngine.toggle(action);
        
        // 2. Persistimos el cambio en la base de datos de IA
        // Guardamos si está corriendo y, si se apaga, podríamos resetear el historial
        const updateData = { isRunning: result.isRunning };
        if (action === 'stop') {
            updateData.historyPoints = []; // Reinicia análisis al apagar
        }

        const updatedDB = await Aibot.findOneAndUpdate(
            {}, 
            updateData, 
            { upsert: true, new: true }
        );
        
        res.json({ 
            success: true, 
            isRunning: updatedDB.isRunning,
            virtualBalance: updatedDB.virtualBalance,
            message: updatedDB.isRunning ? "IA Activada - Analizando mercado" : "IA Detenida" 
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