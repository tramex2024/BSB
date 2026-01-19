// server/routes/autobotRoutes.js

const express = require('express');
const router = express.Router();
const Autobot = require('../models/Autobot');
const MarketSignal = require('../models/MarketSignal');
const authMiddleware = require('../middleware/authMiddleware');
const configController = require('../controllers/configController');
const autobotLogic = require('../autobotLogic');
const bitmartService = require('../services/bitmartService');
const { calculateInitialState } = require('../autobotCalculations');

// ✅ RUTA CORREGIDA (Subiendo niveles correctamente si es necesario)
const { CLEAN_LONG_ROOT, CLEAN_SHORT_ROOT } = require('../src/au/utils/cleanState');

router.use(authMiddleware);

/**
 * Utility para emitir el estado del bot por Sockets
 */
const emitBotState = (autobot, io) => {
    const botData = autobot.toObject();
    const payload = {
        lstate: botData.lstate, sstate: botData.sstate,
        lprofit: botData.lprofit, sprofit: botData.sprofit,
        lbalance: botData.lbalance, sbalance: botData.sbalance,
        lcycle: botData.lcycle, scycle: botData.scycle,
        lcoverage: botData.lcoverage, scoverage: botData.scoverage,
        lnorder: botData.lnorder, snorder: botData.snorder,
        total_profit: botData.total_profit,
        lastAvailableUSDT: botData.lastAvailableUSDT,
        config: botData.config 
    };

    if (io) io.emit('bot-state-update', payload);
    return payload;
};

// --- CONFIGURACIÓN ---
router.post('/update-config', configController.updateBotConfig);

// --- RUTAS DE INICIO (START) ---

router.post('/start', async (req, res) => {
    try {
        const { config } = req.body;
        const tickerData = await bitmartService.getTicker(config.symbol || 'BTC_USDT');
        const currentPrice = parseFloat(tickerData.last_price);

        if (isNaN(currentPrice)) return res.status(503).json({ success: false, message: 'Precio no disponible.' });

        let autobot = await Autobot.findOne({});
        
        if (!autobot) {
            autobot = new Autobot({ config: config });
        } else {
            autobot.config = config; // Sincronizamos con lo que viene del front
        }

        autobot.lstate = 'RUNNING';
        autobot.sstate = 'RUNNING';
        
        // Marcamos habilitados en config
        if(autobot.config.long) autobot.config.long.enabled = true;
        if(autobot.config.short) autobot.config.short.enabled = true;

        autobot.markModified('config');
        await autobot.save();

        emitBotState(autobot, autobotLogic.io);
        res.json({ success: true, message: 'Bot global iniciado.', price: currentPrice });
    } catch (error) {
        console.error("Error Start Global:", error);
        res.status(500).json({ success: false, message: 'Error al iniciar bot global.' });
    }
});

router.post('/start/:side', async (req, res) => {
    try {
        const { side } = req.params;
        const { config } = req.body;
        
        const tickerData = await bitmartService.getTicker(config.symbol || 'BTC_USDT');
        const currentPrice = parseFloat(tickerData.last_price);
        if (isNaN(currentPrice)) return res.status(503).json({ success: false, message: 'Precio no disponible.' });

        let autobot = await Autobot.findOne({});
        if (!autobot) {
            autobot = new Autobot({ config: config });
        } else {
            autobot.config = config;
        }

        if (side === 'long') {
            autobot.lstate = 'RUNNING';
            if(autobot.config.long) autobot.config.long.enabled = true;
        } else if (side === 'short') {
            autobot.sstate = 'RUNNING';
            if(autobot.config.short) autobot.config.short.enabled = true;
        }

        autobot.markModified('config');
        await autobot.save();
        
        emitBotState(autobot, autobotLogic.io);
        res.json({ success: true, message: `Estrategia ${side} iniciada.`, price: currentPrice });
    } catch (error) {
        console.error("Error en Start Individual:", error);
        res.status(500).json({ success: false, message: `Error al iniciar ${req.params.side}.` });
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
            
            // ✅ MIGRADO: Solo usamos siglas raíz y eliminamos lStateData/sStateData
            Object.assign(botState, CLEAN_LONG_ROOT, CLEAN_SHORT_ROOT);
            botState.set('lStateData', undefined); // Eliminamos objeto antiguo
            botState.set('sStateData', undefined); // Eliminamos objeto antiguo
            
            botState.markModified('config');
            await botState.save();
            emitBotState(botState, autobotLogic.io);
            res.json({ success: true, message: 'Bot global detenido.' });
        }
    } catch (error) {
        console.error("Error Stop Global:", error);
        res.status(500).json({ success: false, message: 'Error al detener global.' });
    }
});

router.post('/stop/:side', async (req, res) => {
    try {
        const { side } = req.params;
        const bot = await Autobot.findOne({});
        
        if (side === 'long') {
            bot.lstate = 'STOPPED';
            if(bot.config.long) bot.config.long.enabled = false;
            Object.assign(bot, CLEAN_LONG_ROOT);
            bot.set('lStateData', undefined);
        } else if (side === 'short') {
            bot.sstate = 'STOPPED';
            if(bot.config.short) bot.config.short.enabled = false;
            Object.assign(bot, CLEAN_SHORT_ROOT);
            bot.set('sStateData', undefined);
        }

        bot.markModified('config');
        await bot.save();
        emitBotState(bot, autobotLogic.io);
        res.json({ success: true, message: `${side} detenido correctamente.` });
    } catch (error) {
        console.error("Error Stop Individual:", error);
        res.status(500).json({ success: false, message: `Error al detener ${req.params.side}.` });
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
            lastAvailableUSDT: autobot?.lastAvailableUSDT,
            lastAvailableBTC: autobot?.lastAvailableBTC 
        });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

module.exports = router;