// BSB/server/routes/autobotRoutes.js 

const express = require('express');
const router = express.Router();
const Autobot = require('../models/Autobot');
const MarketSignal = require('../models/MarketSignal');
const autobotLogic = require('../autobotLogic.js');
const { calculateInitialState } = require('../autobotCalculations');
const authMiddleware = require('../middleware/authMiddleware');

// 🟢 Importamos las nuevas limpiezas segmentadas para garantizar independencia
const { 
    CLEAN_STRATEGY_DATA, 
    CLEAN_LONG_ROOT, 
    CLEAN_SHORT_ROOT 
} = require('../src/au/utils/cleanState');

// Importamos el servicio centralizado de BitMart
const bitmartService = require('../services/bitmartService');

// Middleware de autenticación
router.use(authMiddleware);

/**
 * Función mejorada para emitir el estado mediante Socket.io.
 * Ahora incluye todos los campos de ambas estrategias para el Frontend.
 */
const emitBotState = (autobot, io) => {
    const botData = autobot.toObject();
    
    const payload = {
        lstate: botData.lstate || 'STOPPED',
        sstate: botData.sstate || 'STOPPED',
        lprofit: botData.lprofit || 0,
        sprofit: botData.sprofit || 0,
        lbalance: botData.lbalance || 0,
        sbalance: botData.sbalance || 0,
        lcycle: botData.lcycle || 0,
        scycle: botData.scycle || 0,
        lcoverage: botData.lcoverage || 0,
        scoverage: botData.scoverage || 0,
        lnorder: botData.lnorder || 0,
        snorder: botData.snorder || 0,
        total_profit: botData.total_profit || 0,
        lastAvailableUSDT: botData.lastAvailableUSDT || 0
    };

    if (io) {
        io.emit('bot-state-update', payload);
        console.log('[SOCKET]: Estado emitido tras cambio en ruta API.');
    }
    return payload;
};

// --- RUTA START (Arranque Global) ---
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
            // Mezclamos la config enviada con el estado inicial calculado
            autobot.config = { ...autobot.config, ...config, ...initialState };
        }

        // Activamos ambas piernas
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

// --- RUTA STOP (Parada Global Segura) ---
router.post('/stop', async (req, res) => {
    try {
        const botState = await Autobot.findOne({});
        if (botState) {
            botState.lstate = 'STOPPED';
            botState.sstate = 'STOPPED';
            botState.config.long.enabled = false;
            botState.config.short.enabled = false;

            // 🟢 Aplicamos limpieza total pero segmentada para no dejar basura
            Object.assign(botState, CLEAN_LONG_ROOT);
            Object.assign(botState, CLEAN_SHORT_ROOT);

            botState.lStateData = { ...CLEAN_STRATEGY_DATA };
            botState.sStateData = { ...CLEAN_STRATEGY_DATA };
            
            await botState.save();

            const botData = emitBotState(botState, autobotLogic.io);
            autobotLogic.log('Autobot detenido y datos limpiados globalmente.', 'info');
            
            res.json({ success: true, message: 'Bot detenido con éxito.', data: botData });
        } else {
            res.status(404).json({ success: false, message: 'Bot no encontrado.' });
        }
    } catch (error) {
        console.error('Error al detener Autobot:', error);
        res.status(500).json({ success: false, message: 'Error al detener el bot.' });
    }
});

// --- 🟢 NUEVA RUTA: STOP LONG (Independiente) ---
router.post('/stop/long', async (req, res) => {
    try {
        const botState = await Autobot.findOne({});
        if (botState) {
            botState.lstate = 'STOPPED';
            botState.config.long.enabled = false;

            // Limpiamos solo campos Long en la raíz y su objeto de estado
            Object.assign(botState, CLEAN_LONG_ROOT);
            botState.lStateData = { ...CLEAN_STRATEGY_DATA };
            
            await botState.save();
            const botData = emitBotState(botState, autobotLogic.io);
            autobotLogic.log('Estrategia LONG detenida individualmente.', 'info');
            
            res.json({ success: true, message: 'Long detenido.', data: botData });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al detener Long.' });
    }
});

// --- 🟢 NUEVA RUTA: STOP SHORT (Independiente) ---
router.post('/stop/short', async (req, res) => {
    try {
        const botState = await Autobot.findOne({});
        if (botState) {
            botState.sstate = 'STOPPED';
            botState.config.short.enabled = false;

            // Limpiamos solo campos Short en la raíz y su objeto de estado
            Object.assign(botState, CLEAN_SHORT_ROOT);
            botState.sStateData = { ...CLEAN_STRATEGY_DATA };
            
            await botState.save();
            const botData = emitBotState(botState, autobotLogic.io);
            autobotLogic.log('Estrategia SHORT detenida individualmente.', 'info');
            
            res.json({ success: true, message: 'Short detenido.', data: botData });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al detener Short.' });
    }
});

// --- RUTA UPDATE CONFIG (Protegida para Lógica Exponencial) ---
router.post('/update-config', async (req, res) => {
    try {
        const { config } = req.body;
        const symbol = config.symbol || 'BTC_USDT';

        const tickerData = await bitmartService.getTicker(symbol);
        const currentPrice = parseFloat(tickerData.last_price);

        const initialState = calculateInitialState(config, currentPrice);

        let autobot = await Autobot.findOne({});
        if (autobot) {
            // Actualizamos la configuración base
            autobot.config = config; 
            
            // 🟢 CRÍTICO: Solo reseteamos balances y targets si la estrategia está parada.
            // Si está RUNNING, permitimos que la lógica exponencial siga su curso sin saltos de balance.
            if (autobot.lstate === 'STOPPED') {
                autobot.lbalance = initialState.lbalance;
                autobot.lcoverage = initialState.lcoverage;
                autobot.lnorder = initialState.lnorder;
            }
            if (autobot.sstate === 'STOPPED') {
                autobot.sbalance = initialState.sbalance;
                autobot.scoverage = initialState.scoverage;
                autobot.snorder = initialState.snorder;
            }

            await autobot.save();
            const botData = emitBotState(autobot, autobotLogic.io);
            res.json({ success: true, data: botData });
        }
    } catch (error) {
        console.error('Error al actualizar config:', error);
        res.status(500).json({ success: false, message: 'Error al actualizar configuración.' });
    }
});

// --- RUTA: SEÑAL DE MERCADO ---
router.get('/market-signal', async (req, res) => {
    try {
        const signal = await MarketSignal.findOne({ symbol: 'BTC_USDT' });
        if (!signal) {
            return res.status(404).json({ success: false, message: 'No hay señales disponibles.' });
        }
        res.json({ success: true, data: signal });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al obtener señal.' });
    }
});

// --- RUTA: OBTENER CONFIGURACIÓN Y ESTADO COMPLETO ---
router.get('/config-and-state', async (req, res) => {
    try {
        const autobot = await Autobot.findOne({});
        if (!autobot) {
            return res.status(404).json({ success: false, message: 'No se encontró configuración.' });
        }
        
        res.json({ 
            success: true, 
            config: autobot.config,
            lstate: autobot.lstate,
            sstate: autobot.sstate,
            lastAvailableUSDT: autobot.lastAvailableUSDT,
            lastAvailableBTC: autobot.lastAvailableBTC
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error en el servidor.' });
    }
});

module.exports = router;