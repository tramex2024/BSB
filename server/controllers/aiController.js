const path = require('path');
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
            .limit(10); // Aumentado a 10 para mejor visualización inicial

        const dbConfig = await Aibot.findOne({}).lean();

        res.json({
            success: true,
            isRunning: aiEngine.isRunning,
            virtualBalance: aiEngine.virtualBalance || (dbConfig ? dbConfig.virtualBalance : 0),
            historyCount: aiEngine.history ? aiEngine.history.length : 0,
            recentHistory: recentTrades, 
            config: {
                risk: aiEngine.RISK_PER_TRADE || 0.02,
                threshold: 0.85,
                amountUsdt: dbConfig ? dbConfig.amountUsdt : 0,
                stopAtCycle: dbConfig ? dbConfig.stopAtCycle : false
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

        // Antes de iniciar, cargamos la configuración de la DB al Engine
        if (action === 'start') {
            const dbConfig = await Aibot.findOne({}).lean();
            if (dbConfig && dbConfig.amountUsdt) {
                // Sincronizamos el balance del engine con la configuración guardada
                aiEngine.virtualBalance = dbConfig.virtualBalance || dbConfig.amountUsdt;
            }
        }

        const result = await aiEngine.toggle(action);
        
        // Forzamos estado en caso de que el engine no lo asuma inmediatamente
        if (action === 'stop') aiEngine.isRunning = false;
        if (action === 'start') aiEngine.isRunning = true;

        // Persistimos el estado en DB
        await Aibot.findOneAndUpdate({}, { 
            $set: { isRunning: aiEngine.isRunning } 
        }, { upsert: true });

        res.json({ 
            success: true, 
            isRunning: aiEngine.isRunning,
            virtualBalance: aiEngine.virtualBalance,
            message: aiEngine.isRunning ? "IA Activada - Escaneando Mercado" : "IA Detenida - Standby" 
        });
    } catch (error) {
        console.error("Error en toggleAI:", error);
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
 * Actualiza la configuración y el balance inicial
 */
const updateAIConfig = async (req, res) => {
    try {
        const { amountUsdt, stopAtCycle } = req.body;

        if (amountUsdt === undefined) {
            return res.status(400).json({ success: false, message: "Monto no proporcionado" });
        }

        const parsedAmount = parseFloat(amountUsdt);

        // 1. Persistencia en MongoDB
        // Importante: Al actualizar el monto de entrenamiento, reiniciamos el virtualBalance
        const updatedBot = await Aibot.findOneAndUpdate(
            {}, 
            { 
                $set: { 
                    amountUsdt: parsedAmount,
                    virtualBalance: parsedAmount, // Reset del balance al nuevo monto inicial
                    stopAtCycle: !!stopAtCycle,
                    lastUpdate: new Date()
                } 
            }, 
            { upsert: true, new: true }
        );

        // 2. Sincronización inmediata con el Engine si no está corriendo
        if (aiEngine && !aiEngine.isRunning) {
            aiEngine.virtualBalance = parsedAmount;
            console.log(`[AI-ENGINE] Memoria actualizada: Balance virtual = ${parsedAmount}`);
        }

        res.json({
            success: true,
            isRunning: aiEngine.isRunning,
            virtualBalance: aiEngine.virtualBalance,
            message: "Configuración guardada. El balance virtual se ha reiniciado."
        });
    } catch (error) {
        console.error("Error en updateAIConfig:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { 
    getAIStatus, 
    toggleAI, 
    getVirtualHistory, 
    updateAIConfig 
};