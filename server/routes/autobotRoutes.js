// BSB/server/routes/autobotRoutes.js

const express = require('express');
const router = express.Router();
const Autobot = require('../models/Autobot');
const MarketSignal = require('../models/MarketSignal');
const authMiddleware = require('../middleware/authMiddleware');
const configController = require('../controllers/configController');
const autobotLogic = require('../autobotLogic');
const bitmartService = require('../services/bitmartService');

router.use(authMiddleware);

/**
 * Utility para emitir el estado del bot por Sockets
 * Usamos req.app.get('io') para garantizar que usamos la instancia activa del servidor.
 */
const emitBotState = (autobot, req) => {
    try {
        const io = req.app.get('io');
        if (!io) {
            console.error("⚠️ Socket.io no encontrado en req.app");
            return;
        }

        const payload = {
            lstate: autobot.lstate,
            sstate: autobot.sstate,
            config: autobot.config,
            total_profit: autobot.total_profit,
            lastAvailableUSDT: autobot.lastAvailableUSDT,
            // Sincronizado: eliminamos lStateData/sStateData para Arquitectura Plana
        };

        io.emit('bot-state-update', payload);
        console.log(`📡 Broadcast Socket: L:${payload.lstate} S:${payload.sstate}`);
    } catch (err) {
        console.error("❌ Error en emitBotState:", err.message);
    }
};

// --- CONFIGURACIÓN ---

router.post('/update-config', async (req, res) => {
    try {
        const { config } = req.body;
        if (!config) return res.status(400).json({ success: false, message: "No config provided" });

        const updatedBot = await Autobot.findOneAndUpdate(
            {}, 
            { $set: { config: config, lastUpdate: new Date() } },
            { new: true }
        );

        // Notificar cambio de config
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
        const symbol = "BTC_USDT";

        let currentPrice = 0;
        try {
            const tickerData = await bitmartService.getTicker(symbol);
            currentPrice = parseFloat(tickerData.last_price);
        } catch (tickerErr) {
            console.warn("⚠️ Bitmart Ticker Error, continuando...");
        }

        let autobot = await Autobot.findOne({});
        if (!autobot) {
            autobot = new Autobot({ config: config });
        } else {
            autobot.config = config;
        }

        // CAMBIO DE ESTADO
        if (side === 'long') {
            autobot.lstate = 'RUNNING';
            if(autobot.config.long) autobot.config.long.enabled = true;
        } else {
            autobot.sstate = 'RUNNING';
            if(autobot.config.short) autobot.config.short.enabled = true;
        }

        autobot.markModified('config');
        await autobot.save();
        
        // EMISIÓN OFICIAL (Desbloquea el botón en el front)
        emitBotState(autobot, req);

        return res.json({ success: true, message: `Estrategia ${side} iniciada.`, price: currentPrice });
        
    } catch (error) {
        console.error(`Error Crítico Start ${side}:`, error.message);
        return res.status(500).json({ success: false, message: "Error al procesar el inicio." });
    }
});

// --- RUTAS DE PARADA (STOP) ---

router.post('/stop/:side', async (req, res) => {
    const { side } = req.params;
    try {
        const bot = await Autobot.findOne({});
        
        if (bot) {
            if (side === 'long') {
                bot.lstate = 'STOPPED';
                if(bot.config.long) bot.config.long.enabled = false;
            } else if (side === 'short') {
                bot.sstate = 'STOPPED';
                if(bot.config.short) bot.config.short.enabled = false;
            }

            bot.markModified('config');
            await bot.save();

            // EMISIÓN OFICIAL (Desbloquea el botón en el front)
            emitBotState(bot, req);

            return res.json({ success: true, message: `${side} detenido correctamente.` });
        }
        res.status(404).json({ message: "Bot no encontrado" });
    } catch (error) {
        console.error(`Error Stop ${side}:`, error.message);
        return res.status(500).json({ success: false, message: `Error al detener ${side}.` });
    }
});

// --- RUTAS GLOBALES (START/STOP ALL) ---

router.post('/start', async (req, res) => {
    try {
        const { config } = req.body;
        let autobot = await Autobot.findOne({});
        if (!autobot) autobot = new Autobot({ config });
        else autobot.config = config;

        autobot.lstate = 'RUNNING';
        autobot.sstate = 'RUNNING';
        if(autobot.config.long) autobot.config.long.enabled = true;
        if(autobot.config.short) autobot.config.short.enabled = true;

        await autobot.save();
        emitBotState(autobot, req);

        return res.json({ success: true, message: 'Bot global iniciado.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/stop', async (req, res) => {
    try {
        const botState = await Autobot.findOne({});
        if (botState) {
            botState.lstate = 'STOPPED';
            botState.sstate = 'STOPPED';
            if(botState.config.long) botState.config.long.enabled = false;
            if(botState.config.short) botState.config.short.enabled = false;
            
            await botState.save();
            emitBotState(botState, req);
            return res.json({ success: true, message: 'Bot global detenido.' });
        }
        res.status(404).json({ message: "Bot no encontrado" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
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