/**
 * BSB/server/controllers/aiController.js
 * CONTROLADOR MAESTRO - VERSIÓN BLINDADA (Sincronización Total)
 * Gestión de Motor Neural en entorno simulado/independiente.
 */

const aiEngine = require('../src/ai/AIEngine'); // Ruta corregida a la nueva estructura
const Order = require('../models/Order'); 
const Autobot = require('../models/Autobot');
const MarketSignal = require('../models/MarketSignal');

/**
 * Obtiene el estado actual de la IA
 */
const getAIStatus = async (req, res) => {
    const userId = req.user.id;
    try {
        const bot = await Autobot.findOne({ userId }).lean();
        
        // Obtenemos el símbolo configurado para buscar sus velas específicas
        const symbol = bot?.config?.symbol || 'BTC_USDT';
        const marketData = await MarketSignal.findOne({ symbol }).select('history').lean();
        const candleCount = marketData?.history?.length || 0;

        const recentTrades = await Order.find({ userId, strategy: 'ai' })
            .sort({ orderTime: -1 })
            .limit(10)
            .lean();

        res.json({
            success: true,
            isRunning: bot?.aistate === 'RUNNING',
            aistate: bot?.aistate || 'STOPPED', 
            virtualBalance: bot?.aibalance || 0,
            historyCount: candleCount, 
            recentHistory: recentTrades, 
            config: {
                amountUsdt: bot?.config?.ai?.amountUsdt || 0,
                stopAtCycle: bot?.config?.ai?.stopAtCycle || false
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Activa o desactiva el motor de IA con notificación inmediata al motor
 */
const toggleAI = async (req, res) => {
    const userId = req.user.id;
    const { action } = req.body; 
    
    try {
        if (!action) return res.status(400).json({ success: false, message: "Acción no proporcionada" });

        const isStarting = action === 'start';
        const newState = isStarting ? 'RUNNING' : 'STOPPED';

        // 1. Actualización en Base de Datos
        // Al apagar, limpiamos precios de tracking (entry y highest) para resetear métricas visuales
        const updatedBot = await Autobot.findOneAndUpdate(
            { userId },
            { 
                $set: { 
                    aistate: newState,
                    'config.ai.enabled': isStarting,
                    ...(!isStarting && { ailastEntryPrice: 0, aihighestPrice: 0 })
                } 
            },
            { new: true, lean: true }
        );

        if (!updatedBot) return res.status(404).json({ success: false, message: "Bot no encontrado" });

        // 2. SINCRONIZACIÓN MANUAL: 
        // Forzamos un log inmediato a través del motor para que el WebSocket 
        // emita el estado de "Analizando" antes de que el frontend dude.
        if (isStarting && aiEngine && typeof aiEngine._log === 'function') {
            aiEngine._log(userId, "Iniciando Motor Neural...", 0.01, true);
        }

        const symbol = updatedBot.config?.symbol || 'BTC_USDT';
        const marketData = await MarketSignal.findOne({ symbol }).select('history').lean();

        res.json({ 
            success: true, 
            isRunning: isStarting,
            aistate: newState,
            virtualBalance: updatedBot.aibalance,
            historyCount: marketData?.history?.length || 0,
            message: isStarting ? "Motor Neural Activado" : "Motor Neural Detenido" 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Cierre de Emergencia
 */
const panicSell = async (req, res) => {
    const userId = req.user.id;
    try {
        await Autobot.updateOne(
            { userId }, 
            { 
                $set: { 
                    aistate: 'STOPPED', 
                    'config.ai.enabled': false, 
                    ailastEntryPrice: 0,
                    aihighestPrice: 0
                } 
            }
        );
        
        // Notificamos al motor que se detenga inmediatamente si hay procesos pendientes
        if (aiEngine && typeof aiEngine._broadcastStatus === 'function') {
            aiEngine._broadcastStatus(userId, { aistate: 'STOPPED' });
        }

        res.json({
            success: true,
            message: "Posiciones cerradas y motor detenido",
            isRunning: false
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Historial completo
 */
const getVirtualHistory = async (req, res) => {
    const userId = req.user.id;
    try {
        const history = await Order.find({ userId, strategy: 'ai' })
            .sort({ orderTime: -1 })
            .limit(50)
            .lean();
            
        res.json({ success: true, data: history });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Actualiza la configuración IA
 */
const updateAIConfig = async (req, res) => {
    const userId = req.user.id;
    const { amountUsdt, stopAtCycle } = req.body;
    const updateFields = {};

    try {
        if (amountUsdt !== undefined) {
            const val = parseFloat(amountUsdt);
            updateFields['config.ai.amountUsdt'] = val;
            
            // Sincronizamos el balance virtual con la nueva inversión configurada
            // solo si no hay una operación en curso (Sandbox safety)
            const currentBot = await Autobot.findOne({ userId }).select('ailastEntryPrice aibalance').lean();
            
            // Lógica de Interés Compuesto: Si el balance es 0 o no existe, inicializamos.
            // Si el balance ya existe pero no hay posición abierta, actualizamos al nuevo input.
            if (!currentBot?.ailastEntryPrice || currentBot.ailastEntryPrice === 0) {
                updateFields.aibalance = val;
            }
        }

        if (stopAtCycle !== undefined) {
            updateFields['config.ai.stopAtCycle'] = !!stopAtCycle;
        }

        const updatedBot = await Autobot.findOneAndUpdate(
            { userId }, 
            { $set: updateFields }, 
            { new: true, lean: true }
        );

        res.json({
            success: true,
            isRunning: updatedBot.aistate === 'RUNNING',
            virtualBalance: updatedBot.aibalance,
            stopAtCycle: updatedBot.config?.ai?.stopAtCycle,
            message: "Configuración Neural Sincronizada"
        });
    } catch (error) {
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