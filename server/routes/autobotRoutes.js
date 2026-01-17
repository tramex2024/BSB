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

const { CLEAN_STRATEGY_DATA, CLEAN_LONG_ROOT, CLEAN_SHORT_ROOT } = require('../src/au/utils/cleanState');

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

/**
 * START GLOBAL: Enciende Long y Short simultáneamente
 */
router.post('/start', async (req, res) => {
    try {
        const { config } = req.body;
        const tickerData = await bitmartService.getTicker(config.symbol || 'BTC_USDT');
        const currentPrice = parseFloat(tickerData.last_price);

        if (isNaN(currentPrice)) return res.status(503).json({ success: false, message: 'Precio no disponible.' });

        const initialState = calculateInitialState(config, currentPrice);
        let autobot = await Autobot.findOne({});
        
        if (!autobot) {
            autobot = new Autobot({ config: { ...config } });
        } else {
            autobot.config = { ...autobot.config, ...config };
        }

        // Aplicamos estados iniciales dinámicos a ambos
        autobot.config.long = { ...autobot.config.long, ...initialState.long, enabled: true };
        autobot.config.short = { ...autobot.config.short, ...initialState.short, enabled: true };
        
        autobot.lstate = 'RUNNING';
        autobot.sstate = 'RUNNING';
        autobot.markModified('config');

        await autobot.save();
        emitBotState(autobot, autobotLogic.io);
        res.json({ success: true, message: 'Bot global iniciado.', price: currentPrice });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al iniciar bot global.' });
    }
});

/**
 * START INDIVIDUAL: Enciende /api/autobot/start/long o /api/autobot/start/short
 */
router.post('/start/:side', async (req, res) => {
    try {
        const { side } = req.params;
        const { config } = req.body;
        
        const tickerData = await bitmartService.getTicker(config.symbol || 'BTC_USDT');
        const currentPrice = parseFloat(tickerData.last_price);
        if (isNaN(currentPrice)) return res.status(503).json({ success: false, message: 'Precio no disponible.' });

        const initialState = calculateInitialState(config, currentPrice);
        
        // BUSCAR O CREAR (Upsert)
        let autobot = await Autobot.findOne({});
        if (!autobot) {
            autobot = new Autobot({ config: config });
        }

        if (side === 'long') {
            autobot.config.long = { ...config.long, ...initialState.long, enabled: true };
            autobot.lstate = 'RUNNING';
        } else if (side === 'short') {
            autobot.config.short = { ...config.short, ...initialState.short, enabled: true };
            autobot.sstate = 'RUNNING';
        }

        autobot.markModified('config');
        await autobot.save();
        
        emitBotState(autobot, autobotLogic.io);
        res.json({ success: true, message: `Estrategia ${side} iniciada.`, price: currentPrice });
    } catch (error) {
        console.error("Error en Start:", error);
        res.status(500).json({ success: false, message: `Error al iniciar ${req.params.side}.` });
    }
});

// --- RUTAS DE PARADA (STOP) ---

/**
 * STOP GLOBAL: Apaga todo inmediatamente
 */
router.post('/stop', async (req, res) => {
    try {
        const botState = await Autobot.findOne({});
        if (botState) {
            botState.lstate = 'STOPPED';
            botState.sstate = 'STOPPED';
            botState.config.long.enabled = false;
            botState.config.short.enabled = false;
            
            // Limpieza de datos operativos
            Object.assign(botState, CLEAN_LONG_ROOT, CLEAN_SHORT_ROOT);
            botState.lStateData = { ...CLEAN_STRATEGY_DATA };
            botState.sStateData = { ...CLEAN_STRATEGY_DATA };
            
            botState.markModified('config');
            await botState.save();
            emitBotState(botState, autobotLogic.io);
            res.json({ success: true, message: 'Bot global detenido.' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al detener global.' });
    }
});

/**
 * STOP INDIVIDUAL: Apaga /api/autobot/stop/long o /api/autobot/stop/short
 */
router.post('/stop/:side', async (req, res) => {
    try {
        const { side } = req.params;
        const bot = await Autobot.findOne({});
        
        if (side === 'long') {
            bot.lstate = 'STOPPED';
            bot.config.long.enabled = false;
            Object.assign(bot, CLEAN_LONG_ROOT);
            bot.lStateData = { ...CLEAN_STRATEGY_DATA };
        } else if (side === 'short') {
            bot.sstate = 'STOPPED';
            bot.config.short.enabled = false;
            Object.assign(bot, CLEAN_SHORT_ROOT);
            bot.sStateData = { ...CLEAN_STRATEGY_DATA };
        }

        bot.markModified('config');
        await bot.save();
        emitBotState(bot, autobotLogic.io);
        res.json({ success: true, message: `${side} detenido correctamente.` });
    } catch (error) {
        res.status(500).json({ success: false, message: `Error al detener ${req.params.side}.` });
    }
});

// --- CONSULTAS ---

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