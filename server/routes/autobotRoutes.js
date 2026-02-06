// BSB/server/routes/autobotRoutes.js

const express = require('express');
const router = express.Router();
const Autobot = require('../models/Autobot');
const authMiddleware = require('../middleware/authMiddleware');
const autobotLogic = require('../autobotLogic');
const bitmartService = require('../services/bitmartService');

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

router.post('/update-config', async (req, res) => {
    try {
        const { config } = req.body;
        if (!config) return res.status(400).json({ success: false, message: "No config provided" });

        // 1. Notificar a la lógica del bot para recalcular Targets (ltprice/stprice)
        // Esta es la función clave que creamos en autobotLogic
        const updatedBot = await autobotLogic.updateConfig(config);

        // 2. Notificar al Frontend vía Socket
        emitBotState(updatedBot, req);

        res.json({ success: true, data: updatedBot });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// --- RUTAS DE INICIO (START) ---

router.post('/start/:side', async (req, res) => {
    const { side } = req.params;
    try {
        const { config } = req.body;
        
        // Usamos la lógica centralizada para iniciar
        // Esto asegura que se verifiquen balances y se pongan las órdenes iniciales si es necesario
        const updatedBot = await autobotLogic.startSide(side, config);

        emitBotState(updatedBot, req);

        return res.json({ 
            success: true, 
            message: `Estrategia ${side} iniciada.`, 
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
        // Usamos la lógica centralizada para detener
        const updatedBot = await autobotLogic.stopSide(side);

        emitBotState(updatedBot, req);

        return res.json({ success: true, message: `${side} detenido correctamente.` });
    } catch (error) {
        console.error(`Error Stop ${side}:`, error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// --- RUTAS GLOBALES (START/STOP ALL) ---

router.post('/start', async (req, res) => {
    try {
        const { config } = req.body;
        // Iniciamos ambos lados
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

router.get('/config-and-state', async (req, res) => {
    try {
        const autobot = await Autobot.findOne({});
        res.json({ 
            success: !!autobot, 
            config: autobot?.config, 
            lstate: autobot?.lstate, 
            sstate: autobot?.sstate,
            lastAvailableUSDT: autobot?.lastAvailableUSDT 
        });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

module.exports = router;