const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController'); // Usamos el auth que ya tenemos
const autobotLogic = require('../autobotLogic');
const configController = require('../controllers/configController');

// Importamos los validadores y servicios acordados
const strategyValidator = require('../src/au/utils/strategyValidator');
const ExitLiquidationService = require('../services/exitLiquidationService'); // Para el preview de STOP
const Autobot = require('../models/Autobot'); // Tu modelo de Mongoose

// Usamos el middleware consistente de los otros archivos
router.use(userController.authenticateToken);

/**
 * Utilidad para emitir el estado actualizado a la SALA PRIVADA del usuario
 */
const emitBotState = (autobot, req) => {
    try {
        const io = req.app.get('io');
        if (!io || !autobot || !autobot.userId) return;
        
        const payload = autobot.toObject ? autobot.toObject() : autobot;
        const userIdStr = autobot.userId.toString();

        // 🎯 IMPORTANTE: Emitimos solo a la sala del usuario (sin guiones)
        io.to(userIdStr).emit('bot-state-update', payload);
    } catch (err) {
        console.error("❌ Error en emitBotState (Routes):", err.message);
    }
};

// --- CONFIGURACIÓN ---
router.post('/update-config', configController.updateBotConfig);
router.get('/config-and-state', configController.getBotConfig);

// --- NUEVA RUTA: PREVIEW ANTES DE INICIAR (START) ---
router.get('/start-preview/:side', async (req, res) => {
    const { side } = req.params;
    const userId = req.user.id;
    
    try {
        const botState = await Autobot.findOne({ userId }).lean();
        const currentPrice = autobotLogic.getLastPrice();
        
        const analysis = strategyValidator.getStartAnalysis(side, {
            botState,
            availableUSDT: botState.lastAvailableUSDT || 0,
            availableBTC: botState.lastAvailableBTC || 0,
            currentPrice,
            log: console.log 
        });

        return res.json({
            success: true,
            data: analysis.report,
            canPass: analysis.canPass
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * --- NUEVA RUTA: PREVIEW ANTES DE DETENER (STOP) ---
 * Proporciona PnL, activos a liquidar y órdenes abiertas para el modal.
 */
router.get('/stop-preview/:strategy', async (req, res) => {
    const { strategy } = req.params;
    const userId = req.user.id;
    
    try {
        const botState = await Autobot.findOne({ userId }).lean();
        const currentPrice = autobotLogic.getLastPrice();
        
        // Obtenemos el reporte detallado desde el servicio de liquidación
        const report = await ExitLiquidationService.getExitReport(strategy, botState, currentPrice);
        
        return res.json({
            status: 'success', // Mantenemos el formato esperado por botControls.js
            data: report.data
        });
    } catch (error) {
        return res.status(500).json({ status: 'error', message: error.message });
    }
});

// --- RUTAS DE EJECUCIÓN (START / STOP POR LADO) ---

router.post('/start/:side', async (req, res) => {
    const { side } = req.params;
    const userId = req.user.id; 
    try {
        const { config } = req.body;
        
        const updatedBot = await autobotLogic.startSide(userId, side, config);
        emitBotState(updatedBot, req);

        return res.json({ 
            success: true, 
            message: `Estrategia ${side.toUpperCase()} iniciada.`, 
            price: autobotLogic.getLastPrice() 
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/stop/:side', async (req, res) => {
    const { side } = req.params;
    const userId = req.user.id;
    try {
        const updatedBot = await autobotLogic.stopSide(userId, side);
        emitBotState(updatedBot, req);
        return res.json({ success: true, message: `${side.toUpperCase()} detenido.` });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

// --- OPERACIONES GLOBALES (TODO EL BOT) ---

router.post('/start', async (req, res) => {
    const userId = req.user.id;
    try {
        const { config } = req.body;
        await autobotLogic.startSide(userId, 'long', config);
        const updatedBot = await autobotLogic.startSide(userId, 'short', config);
        
        emitBotState(updatedBot, req);
        return res.json({ success: true, message: 'LONG & SHORT activados.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/stop', async (req, res) => {
    const userId = req.user.id;
    try {
        await autobotLogic.stopSide(userId, 'long');
        const updatedBot = await autobotLogic.stopSide(userId, 'short');
        
        emitBotState(updatedBot, req);
        return res.json({ success: true, message: 'Sistema Global detenido.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;