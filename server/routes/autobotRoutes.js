// BSB/server/routes/autobotRoutes.js 

const express = require('express');
const router = express.Router();
const Autobot = require('../models/Autobot');
const autobotLogic = require('../autobotLogic.js');
const { calculateInitialState } = require('../autobotCalculations');
const authMiddleware = require('../middleware/authMiddleware');
const { CLEAN_STRATEGY_DATA, CLEAN_ROOT_FIELDS } = require('../src/au/utils/cleanState');

// Importamos el servicio centralizado de BitMart
const bitmartService = require('../services/bitmartService');

// Middleware de autenticación
router.use(authMiddleware);

/**
 * Función mejorada para emitir el estado.
 * Asegura que los nombres de los campos coincidan con lo que el dashboard.js espera.
 */
const emitBotState = (autobot, io) => {
    const botData = autobot.toObject();
    
    // Mapeo explícito para asegurar compatibilidad con el Dashboard corregido
    const payload = {
        lstate: botData.lstate || 'STOPPED',
        sstate: botData.sstate || 'STOPPED',
        lprofit: botData.lprofit || 0,
        lbalance: botData.lbalance || 0,
        sbalance: botData.sbalance || 0,
        lcycle: botData.lcycle || 0,
        scycle: botData.scycle || 0,
        lcoverage: botData.lcoverage || 0,
        lnorder: botData.lnorder || 0,
        total_profit: botData.total_profit || 0,
        lastAvailableUSDT: botData.lastAvailableUSDT || 0
    };

    if (io) {
        io.emit('bot-state-update', payload);
        console.log('[SOCKET]: Estado emitido tras cambio en ruta API.');
    }
    return payload;
};

// --- RUTA START ---
router.post('/start', async (req, res) => {
    try {
        const { config } = req.body;
        const symbol = config.symbol || 'BTC_USDT';

        const tickerData = await bitmartService.getTicker(symbol);
        const currentPrice = parseFloat(tickerData.last_price);

        if (isNaN(currentPrice)) {
            return res.status(503).json({ success: false, message: 'Fallo al obtener el precio de BitMart.' });
        }

        const initialState = calculateInitialState(config, currentPrice);

        let autobot = await Autobot.findOne({});
        if (!autobot) {
            autobot = new Autobot({ config: { ...config, ...initialState } });
        } else {
            autobot.config = { ...autobot.config, ...config, ...initialState };
        }

        // Activamos los estados
        autobot.lstate = 'RUNNING';
        autobot.sstate = 'RUNNING';
        autobot.config.long.enabled = true;
        autobot.config.short.enabled = true;

        await autobot.save();
        
        const botData = emitBotState(autobot, autobotLogic.io);
        res.json({ success: true, message: 'Autobot iniciado.', data: botData });

    } catch (error) {
        console.error('Error al iniciar Autobot:', error);
        res.status(500).json({ success: false, message: 'Error al iniciar estrategias.' });
    }
});

// --- RUTA STOP ---
router.post('/stop', async (req, res) => {
    try {
        const botState = await Autobot.findOne({});
        if (botState) {
            // Detener estados
            botState.lstate = 'STOPPED';
            botState.sstate = 'STOPPED';
            botState.config.long.enabled = false;
            botState.config.short.enabled = false;

            // Limpieza de campos raíz
            botState.ltprice = CLEAN_ROOT_FIELDS.ltprice; 
            botState.stprice = CLEAN_ROOT_FIELDS.stprice;
            botState.lsprice = CLEAN_ROOT_FIELDS.lsprice; 
            botState.sbprice = CLEAN_ROOT_FIELDS.sbprice;

            // Limpieza de datos de estrategia (posición actual, promedios)
            botState.lStateData = Object.assign({}, CLEAN_STRATEGY_DATA);
            botState.sStateData = Object.assign({}, CLEAN_STRATEGY_DATA);
            
            await botState.save();

            const botData = emitBotState(botState, autobotLogic.io);
            autobotLogic.log('Autobot detenido y datos limpiados.', 'info');
            
            res.json({ success: true, message: 'Bot detenido con éxito.', data: botData });
        } else {
            res.status(404).json({ success: false, message: 'Bot no encontrado.' });
        }
    } catch (error) {
        console.error('Error al detener Autobot:', error);
        res.status(500).json({ success: false, message: 'Error al detener el bot.' });
    }
});

// --- RUTA UPDATE CONFIG ---
router.post('/update-config', async (req, res) => {
    try {
        const { config } = req.body;
        const symbol = config.symbol || 'BTC_USDT';

        // Mapeo de profit_percent
        if (config.long?.trigger !== undefined) {
            config.long.profit_percent = config.long.trigger;
            delete config.long.trigger; 
        }

        const tickerData = await bitmartService.getTicker(symbol);
        const currentPrice = parseFloat(tickerData.last_price);

        const initialState = calculateInitialState(config, currentPrice);

        let autobot = await Autobot.findOne({});
        if (autobot) {
            autobot.config = config; 
            autobot.lcoverage = initialState.lcoverage;
            autobot.lnorder = initialState.lnorder;
            
            if (autobot.lstate === 'STOPPED') autobot.lbalance = initialState.lbalance;
            if (autobot.sstate === 'STOPPED') autobot.sbalance = initialState.sbalance;

            await autobot.save();
            const botData = emitBotState(autobot, autobotLogic.io);
            res.json({ success: true, data: botData });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al actualizar configuración.' });
    }
});

module.exports = router;