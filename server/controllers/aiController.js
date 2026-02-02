//server/controllers/aiController.js

/**
 * Archivo: server/controllers/aiController.js
 * Controlador maestro para la gestión de la IA y Órdenes Virtuales
 */

const aiEngine = require('../src/ai/AIEngine'); 
const AIBotOrder = require('../models/AIBotOrder');
const Aibot = require('../models/Aibot'); 

/**
 * Obtiene el estado actual de la IA, balance virtual y trades recientes
 */
const getAIStatus = async (req, res) => {
    try {
        const recentTrades = await AIBotOrder.find({ isVirtual: true })
            .sort({ timestamp: -1 })
            .limit(10);

        const dbConfig = await Aibot.findOne({}).lean();

        res.json({
            success: true,
            isRunning: aiEngine.isRunning,
            virtualBalance: aiEngine.virtualBalance || (dbConfig ? dbConfig.virtualBalance : 0),
            historyCount: aiEngine.history ? aiEngine.history.length : 0,
            recentHistory: recentTrades, 
            config: {
                risk: aiEngine.RISK_PER_TRADE || 1.0,
                threshold: 0.85,
                amountUsdt: dbConfig ? dbConfig.amountUsdt : 0,
                stopAtCycle: aiEngine.stopAtCycle // Prioridad absoluta a la memoria del motor
            }
        });
    } catch (error) {
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

        // El motor gestiona la lógica interna y persiste el cambio en DB
        const result = await aiEngine.toggle(action);

        res.json({ 
            success: true, 
            isRunning: result.isRunning,
            virtualBalance: result.virtualBalance,
            message: result.isRunning ? "IA Activada - Escaneando Mercado" : "IA Detenida - Standby" 
        });
    } catch (error) {
        console.error("❌ Error en toggleAI:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Cierre de Emergencia: Vende posición actual y apaga el motor
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
        console.error("❌ Error en panicSell:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Obtiene el historial completo de órdenes virtuales
 */
const getVirtualHistory = async (req, res) => {
    try {
        const history = await AIBotOrder.find({ isVirtual: true })
            .sort({ timestamp: -1 })
            .limit(50); 
            
        res.json({ success: true, data: history });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Actualiza la configuración y sincroniza con el motor en tiempo real
 */
const updateAIConfig = async (req, res) => {
    try {
        const { amountUsdt, stopAtCycle } = req.body;
        const updateFields = {};

        // 1. Manejo del Monto / Reset de Balance
        if (amountUsdt !== undefined) {
            const parsedAmount = parseFloat(amountUsdt);
            updateFields.amountUsdt = parsedAmount;
            
            // Solo permitimos resetear el balance si la IA no está operando
            if (!aiEngine.isRunning) {
                updateFields.virtualBalance = parsedAmount;
                aiEngine.virtualBalance = parsedAmount;
                aiEngine.amountUsdt = parsedAmount;
            }
        }

        // 2. Sincronización del Switch 'Stop at Cycle'
        if (stopAtCycle !== undefined) {
            const isStopActive = !!stopAtCycle;
            updateFields.stopAtCycle = isStopActive;
            
            // Actualización inmediata en la RAM del motor
            aiEngine.stopAtCycle = isStopActive;
        }

        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ success: false, message: "No se enviaron campos válidos" });
        }

        updateFields.lastUpdate = new Date();

        // Persistencia en MongoDB
        const updatedBot = await Aibot.findOneAndUpdate(
            {}, 
            { $set: updateFields }, 
            { upsert: true, new: true }
        );

        // NOTIFICACIÓN PUSH: Avisar al front-end vía Sockets del cambio de configuración
        if (aiEngine._broadcastStatus) {
            aiEngine._broadcastStatus();
        }

        res.json({
            success: true,
            isRunning: aiEngine.isRunning,
            virtualBalance: aiEngine.virtualBalance,
            stopAtCycle: updatedBot.stopAtCycle,
            message: "Configuración Neural Sincronizada"
        });
    } catch (error) {
        console.error("❌ Error en updateAIConfig:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { 
    getAIStatus, 
    toggleAI, 
    panicSell, 
    getVirtualHistory, 
    updateAIConfig 
};