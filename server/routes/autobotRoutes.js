const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController'); // Usamos el auth que ya tenemos
const autobotLogic = require('../autobotLogic');
const configController = require('../controllers/configController');

// Importamos el validador para la nueva ruta de preview
const strategyValidator = require('../src/au/utils/strategyValidator');
const Autobot = require('../models/Autobot'); // Asumiendo que este es tu modelo

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

// --- NUEVA RUTA: PREVIEW ANTES DE INICIAR ---
// Esta ruta es consultada por el frontend para llenar el modal con info técnica
router.get('/start-preview/:side', async (req, res) => {
    const { side } = req.params;
    const userId = req.user.id;
    
    try {
        // Obtenemos el estado actual y balances
        const botState = await Autobot.findOne({ userId }).lean();
        const currentPrice = autobotLogic.getLastPrice();
        
        // Ejecutamos el análisis sin encender el bot
        const analysis = strategyValidator.getStartAnalysis(side, {
            botState,
            availableUSDT: botState.lastAvailableUSDT || 0,
            availableBTC: botState.lastAvailableBTC || 0,
            currentPrice,
            log: console.log // Opcional
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

// --- RUTAS DE EJECUCIÓN (START / STOP POR LADO) ---

router.post('/start/:side', async (req, res) => {
    const { side } = req.params;
    const userId = req.user.id; // Obtenido del token JWT
    try {
        const { config } = req.body;
        
        // Pasamos el userId para que el motor sepa de quién es el bot
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