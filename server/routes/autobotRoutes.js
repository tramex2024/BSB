// BSB/server/routes/autobotRoutes.js

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const autobotLogic = require('../autobotLogic');
const configController = require('../controllers/configController');

router.use(authMiddleware);

/**
 * Utilidad para emitir el estado actualizado a través de WebSockets
 */
const emitBotState = (autobot, req) => {
    try {
        const io = req.app.get('io');
        if (!io || !autobot) return;
        const payload = autobot.toObject ? autobot.toObject() : autobot;
        io.emit('bot-state-update', payload);
    } catch (err) {
        console.error("❌ Error en emitBotState (Routes):", err.message);
    }
};

// --- CONFIGURACIÓN ---

// Esta ruta usa el controlador blindado para guardar cambios sin perder datos
router.post('/update-config', configController.updateBotConfig);

/**
 * Obtiene configuración y estado actual (Sincronizado para evitar errores de carga)
 */
router.get('/config-and-state', configController.getBotConfig);


// --- RUTAS DE EJECUCIÓN (START / STOP) ---

router.post('/start/:side', async (req, res) => {
    const { side } = req.params;
    try {
        const { config } = req.body;
        
        // El motor startSide ya maneja la persistencia y validación internamente
        const updatedBot = await autobotLogic.startSide(side, config);
        emitBotState(updatedBot, req);

        return res.json({ 
            success: true, 
            message: `Estrategia ${side.toUpperCase()} iniciada correctamente.`, 
            price: autobotLogic.getLastPrice() 
        });
        
    } catch (error) {
        console.error(`❌ Error Start ${side}:`, error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/stop/:side', async (req, res) => {
    const { side } = req.params;
    try {
        const updatedBot = await autobotLogic.stopSide(side);
        emitBotState(updatedBot, req);
        return res.json({ success: true, message: `${side.toUpperCase()} detenido correctamente.` });
    } catch (error) {
        console.error(`❌ Error Stop ${side}:`, error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// --- OPERACIONES GLOBALES ---

router.post('/start', async (req, res) => {
    try {
        const { config } = req.body;
        // Inicia ambas ramas secuencialmente
        await autobotLogic.startSide('long', config);
        const updatedBot = await autobotLogic.startSide('short', config);
        
        emitBotState(updatedBot, req);
        return res.json({ success: true, message: 'Sistema Global activado (LONG & SHORT).' });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/stop', async (req, res) => {
    try {
        await autobotLogic.stopSide('long');
        const updatedBot = await autobotLogic.stopSide('short');
        
        emitBotState(updatedBot, req);
        return res.json({ success: true, message: 'Sistema Global detenido.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;