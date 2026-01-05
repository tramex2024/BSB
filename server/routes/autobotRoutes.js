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
        config: botData.config // 🟢 Añadido para que el front reciba la config actualizada
    };

    if (io) io.emit('bot-state-update', payload);
    return payload;
};

// 🟢 RUTA CORREGIDA: Usa el controlador centralizado
router.post('/update-config', configController.updateBotConfig);

// --- RUTA START ---
router.post('/start', async (req, res) => {
    try {
        const { config } = req.body;
        const tickerData = await bitmartService.getTicker(config.symbol || 'BTC_USDT');
        const currentPrice = parseFloat(tickerData.last_price);

        if (isNaN(currentPrice)) return res.status(503).json({ success: false, message: 'Precio no disponible.' });

        const initialState = calculateInitialState(config, currentPrice);
        let autobot = await Autobot.findOne({});
        
        if (!autobot) {
            autobot = new Autobot({ config: { ...config, ...initialState } });
        } else {
            autobot.config = { ...autobot.config, ...config, ...initialState };
            autobot.markModified('config');
        }

        autobot.lstate = 'RUNNING';
        autobot.sstate = 'RUNNING';
        autobot.config.long.enabled = true;
        autobot.config.short.enabled = true;

        await autobot.save();
        const botData = emitBotState(autobot, autobotLogic.io);
        res.json({ success: true, message: 'Bot iniciado.', data: botData });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al iniciar.' });
    }
});

// --- RUTA STOP (Global) ---
router.post('/stop', async (req, res) => {
    try {
        const botState = await Autobot.findOne({});
        if (botState) {
            botState.lstate = 'STOPPED';
            botState.sstate = 'STOPPED';
            botState.config.long.enabled = false;
            botState.config.short.enabled = false;
            Object.assign(botState, CLEAN_LONG_ROOT, CLEAN_SHORT_ROOT);
            botState.lStateData = { ...CLEAN_STRATEGY_DATA };
            botState.sStateData = { ...CLEAN_STRATEGY_DATA };
            botState.markModified('config');
            await botState.save();
            emitBotState(botState, autobotLogic.io);
            res.json({ success: true, message: 'Bot detenido.' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al detener.' });
    }
});

// --- RUTA STOP LONG / SHORT ---
router.post('/stop/long', async (req, res) => {
    try {
        const bot = await Autobot.findOne({});
        bot.lstate = 'STOPPED';
        bot.config.long.enabled = false;
        Object.assign(bot, CLEAN_LONG_ROOT);
        bot.lStateData = { ...CLEAN_STRATEGY_DATA };
        bot.markModified('config');
        await bot.save();
        emitBotState(bot, autobotLogic.io);
        res.json({ success: true, message: 'Long detenido.' });
    } catch (error) { res.status(500).send(); }
});

router.post('/stop/short', async (req, res) => {
    try {
        const bot = await Autobot.findOne({});
        bot.sstate = 'STOPPED';
        bot.config.short.enabled = false;
        Object.assign(bot, CLEAN_SHORT_ROOT);
        bot.sStateData = { ...CLEAN_STRATEGY_DATA };
        bot.markModified('config');
        await bot.save();
        emitBotState(bot, autobotLogic.io);
        res.json({ success: true, message: 'Short detenido.' });
    } catch (error) { res.status(500).send(); }
});

// Rutas de consulta
router.get('/config-and-state', async (req, res) => {
    const autobot = await Autobot.findOne({});
    res.json({ 
        success: !!autobot, 
        config: autobot?.config, 
        lstate: autobot?.lstate, 
        sstate: autobot?.sstate,
        lastAvailableUSDT: autobot?.lastAvailableUSDT, // Añadido
        lastAvailableBTC: autobot?.lastAvailableBTC     // Añadido
    });
});

module.exports = router;