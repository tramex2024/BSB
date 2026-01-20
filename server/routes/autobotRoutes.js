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
 */
const emitBotState = (autobot, io) => {
    try {
        const payload = {
            lstate: autobot.lstate,
            sstate: autobot.sstate,
            lStateData: autobot.lStateData,
            sStateData: autobot.sStateData,
            config: autobot.config,
            total_profit: autobot.total_profit,
            lastAvailableUSDT: autobot.lastAvailableUSDT
        };
        if (io) {
            io.emit('bot-state-update', payload);
        }
    } catch (err) {
        console.error("Error en emitBotState:", err.message);
    }
};

// --- CONFIGURACIÓN ---
// En tu archivo de rutas del backend
router.post('/update-config', async (req, res) => {
    try {
        const { config } = req.body;
        if (!config) return res.status(400).json({ success: false, message: "No config provided" });

        // Actualización atómica de la configuración
        const updatedBot = await Autobot.findOneAndUpdate(
            {}, 
            { $set: { config: config, lastUpdate: new Date() } },
            { new: true }
        );

        // Notificar a todos los clientes por Socket para que vean el cambio
        if (req.app.get('io')) {
            req.app.get('io').emit('bot-state-update', updatedBot);
        }

        res.json({ success: true, data: updatedBot });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// --- RUTAS DE INICIO (START) ---

router.post('/start', async (req, res) => {
    try {
        const { config } = req.body;
        
        // Blindaje del símbolo para no romper el bitmartService
        const symbol = (config && config.symbol) ? config.symbol : 'BTC_USDT';
        const tickerData = await bitmartService.getTicker(symbol);
        const currentPrice = parseFloat(tickerData.last_price);

        if (isNaN(currentPrice)) {
            return res.status(503).json({ success: false, message: 'Precio no disponible.' });
        }

        let autobot = await Autobot.findOne({});
        if (!autobot) {
            autobot = new Autobot({ config: config });
        } else {
            autobot.config = config;
        }

        autobot.lstate = 'RUNNING';
        autobot.sstate = 'RUNNING';
        
        if(autobot.config.long) autobot.config.long.enabled = true;
        if(autobot.config.short) autobot.config.short.enabled = true;

        autobot.markModified('config');
        await autobot.save();

        emitBotState(autobot, autobotLogic.io);

        return res.json({ success: true, message: 'Bot global iniciado.', price: currentPrice });
    } catch (error) {
        console.error("Error Crítico Start Global:", error.message);
        return res.status(500).json({ success: false, message: 'Error interno al iniciar.' });
    }
});

router.post('/start/:side', async (req, res) => {
    const { side } = req.params;
    try {
        const { config } = req.body;
        const symbol = "BTC_USDT"; // Hardcoded para asegurar compatibilidad total

        let currentPrice = 0;
        try {
            // Intentamos obtener el ticker, pero si falla (400), no matamos el proceso
            const tickerData = await bitmartService.getTicker(symbol);
            currentPrice = parseFloat(tickerData.last_price);
        } catch (tickerErr) {
            console.warn("⚠️ Bitmart Ticker Error 400, usando fallback o continuando...");
        }

        let autobot = await Autobot.findOne({});
        if (!autobot) {
            autobot = new Autobot({ config: config });
        } else {
            // Actualizamos la config que viene del Front
            autobot.config = config;
        }

        // CAMBIO DE ESTADO (Esto es lo que pone los botones en rojo)
        if (side === 'long') {
            autobot.lstate = 'RUNNING';
            if(autobot.config.long) autobot.config.long.enabled = true;
        } else {
            autobot.sstate = 'RUNNING';
            if(autobot.config.short) autobot.config.short.enabled = true;
        }

        autobot.markModified('config');
        await autobot.save();
        
        emitBotState(autobot, autobotLogic.io);

        // Respondemos ÉXITO para que el Front cambie el botón
        return res.json({ success: true, message: `Estrategia ${side} iniciada.`, price: currentPrice });
        
    } catch (error) {
        console.error(`Error Crítico en el proceso de inicio:`, error.message);
        return res.status(500).json({ success: false, message: "Error al procesar el inicio." });
    }
});

// --- RUTAS DE PARADA (STOP) ---

router.post('/stop', async (req, res) => {
    try {
        const botState = await Autobot.findOne({});
        if (botState) {
            botState.lstate = 'STOPPED';
            botState.sstate = 'STOPPED';
            if(botState.config.long) botState.config.long.enabled = false;
            if(botState.config.short) botState.config.short.enabled = false;
            
            botState.markModified('config');
            await botState.save();

            emitBotState(botState, autobotLogic.io);
            return res.json({ success: true, message: 'Bot global detenido.' });
        }
        res.status(404).json({ message: "Bot no encontrado" });
    } catch (error) {
        console.error("Error Stop Global:", error.message);
        res.status(500).json({ success: false, message: 'Error al detener global.' });
    }
});

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
            emitBotState(bot, autobotLogic.io);
            return res.json({ success: true, message: `${side} detenido correctamente.` });
        }
        res.status(404).json({ message: "Bot no encontrado" });
    } catch (error) {
        console.error(`Error Stop ${side}:`, error.message);
        return res.status(500).json({ success: false, message: `Error al detener ${side}.` });
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