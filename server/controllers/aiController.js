/**
 * Archivo: BSB/server/controllers/aiController.js
 * Versión: Presupuesto Dinámico & Persistencia 2026
 */
const aiEngine = require('../src/ai/AIEngine'); 
const AIBotOrder = require('../models/AIBotOrder');
const Aibot = require('../models/Aibot'); 

const getAIStatus = async (req, res) => {
    try {
        // Buscamos la configuración guardada en la DB (Persistencia)
        const configDB = await Aibot.findOne() || {};

        const recentTrades = await AIBotOrder.find({ isVirtual: true })
            .sort({ timestamp: -1 })
            .limit(5);

        res.json({
            success: true,
            isRunning: aiEngine.isRunning,
            virtualBalance: aiEngine.virtualBalance || configDB.virtualBalance || 0,
            historyCount: aiEngine.history ? aiEngine.history.length : 0,
            recentHistory: recentTrades, 
            config: {
                risk: aiEngine.RISK_PER_TRADE || 0.1,
                threshold: 0.85,
                savedBudget: configDB.virtualBalance || 0 // Enviamos el valor guardado
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const toggleAI = async (req, res) => {
    try {
        const { action, budget } = req.body;
        
        if (!action) {
            return res.status(400).json({ success: false, message: "Acción no proporcionada" });
        }

        let numericBudget = parseFloat(budget);

        if (action === 'start') {
            if (!numericBudget || numericBudget <= 0) {
                return res.status(400).json({ success: false, message: "Presupuesto inicial requerido" });
            }

            // --- PERSISTENCIA PROACTIVA ---
            // Guardamos o actualizamos en la DB para que al recargar la web el valor siga ahí
            await Aibot.findOneAndUpdate(
                {}, 
                { virtualBalance: numericBudget, lastUpdate: new Date() },
                { upsert: true, new: true }
            );
            console.log(`[AI-DATABASE] Presupuesto de $${numericBudget} guardado con éxito.`);
        }

        console.log(`[AI-CONTROLLER] Comando: ${action}${action === 'start' ? ` con Budget: $${numericBudget}` : ''}`);

        // 1. Iniciamos/Detenemos el motor
        await aiEngine.toggle(action, numericBudget);
        
        // 2. Sincronización de seguridad
        if (action === 'stop') aiEngine.isRunning = false;

        res.json({ 
            success: true, 
            isRunning: aiEngine.isRunning,
            virtualBalance: aiEngine.virtualBalance,
            message: aiEngine.isRunning ? `IA Activada con $${aiEngine.virtualBalance}` : "IA Detenida" 
        });

    } catch (error) {
        console.error("❌ Error en toggleAI:", error);
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