// BSB/server/routes/autobotRoutes.js

const express = require('express');
const router = express.Router();
const Autobot = require('../models/Autobot');
const authMiddleware = require('../middleware/authMiddleware');
const autobotLogic = require('../autobotLogic');
const bitmartService = require('../services/bitmartService');

// 🛡️ IMPORTANTE: Conexión con el controlador que acabas de compartir
const configController = require('../controllers/configController');

router.use(authMiddleware);

/**
 * Emite el estado COMPLETO del bot por Sockets
 */
const emitBotState = (autobot, req) => {
    try {
        const io = req.app.get('io');
        if (!io) return;
        const payload = autobot.toObject ? autobot.toObject() : autobot;
        io.emit('bot-state-update', payload);
    } catch (err) {
        console.error("❌ Error en emitBotState:", err.message);
    }
};

// --- CONFIGURACIÓN ---

/**
 * Reemplazamos la lógica interna por la del controlador
 * Esto resuelve el problema de los ceros al guardar.
 */
router.post('/update-config', configController.updateBotConfig);

// --- RUTAS DE INICIO (START) ---

router.post('/start/:side', async (req, res) => {
    const { side } = req.params;
    try {
        const { config } = req.body;
        
        // Sincronizamos configuración antes de arrancar para evitar desfases
        if (config) {
            // Llamada interna al controlador para persistir datos
            await Autobot.findOneAndUpdate({}, { 
                $set: { 
                    [`config.${side}.profit_percent`]: parseFloat(config[side]?.profit_percent || 1.5),
                    [`config.${side}.price_step_inc`]: parseFloat(config[side]?.price_step_inc || 0)
                }
            });
        }

        const updatedBot = await autobotLogic.startSide(side, config);
        emitBotState(updatedBot, req);

        return res.json({ 
            success: true, 
            message: `Estrategia ${side.toUpperCase()} iniciada.`, 
            price: autobotLogic.getLastPrice() 
        });
        
    } catch (error) {
        console.error(`Error Crítico Start ${side}:`, error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// --- RUTAS DE PARADA (STOP) ---

router.post('/stop/:side', async (req, res) => {
    const { side } = req.params;
    try {
        const updatedBot = await autobotLogic.stopSide(side);
        emitBotState(updatedBot, req);
        return res.json({ success: true, message: `${side.toUpperCase()} detenido correctamente.` });
    } catch (error) {
        console.error(`Error Stop ${side}:`, error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// --- RUTAS GLOBALES (START/STOP ALL) ---

router.post('/start', async (req, res) => {
    try {
        const { config } = req.body;
        await autobotLogic.startSide('long', config);
        const updatedBot = await autobotLogic.startSide('short', config);
        emitBotState(updatedBot, req);
        return res.json({ success: true, message: 'Bot global iniciado.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/stop', async (req, res) => {
    try {
        await autobotLogic.stopSide('long');
        const updatedBot = await autobotLogic.stopSide('short');
        emitBotState(updatedBot, req);
        return res.json({ success: true, message: 'Bot global detenido.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Sincronizado con getBotConfig para evitar el error de Render
 */
router.get('/config-and-state', configController.getBotConfig);

module.exports = router;