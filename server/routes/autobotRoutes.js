// server/routes/autobotRoutes.js

const express = require('express');
const router = express.Router();
const Autobot = require('../models/Autobot');
const autobotLogic = require('../autobotLogic.js');
const { calculateInitialState } = require('../autobotCalculations');
const authMiddleware = require('../middleware/authMiddleware');

// Importamos el servicio centralizado de BitMart
const bitmartService = require('../services/bitmartService');

// Middleware para proteger todas las rutas del router
router.use(authMiddleware);

router.post('/start', async (req, res) => {
    try {
        // En lugar de long, short, options, esperamos recibir la 'config' completa
        const { config } = req.body;
        const userId = req.user.id;
        const symbol = config.symbol;

        if (!symbol) {
            return res.status(400).json({ success: false, message: 'El símbolo del trading no está especificado.' });
        }

        // Paso 1: Obtener el precio actual de BitMart
        const tickerData = await bitmartService.getTicker(symbol);
        const currentPrice = parseFloat(tickerData.last_price);

        if (isNaN(currentPrice)) {
            return res.status(503).json({ success: false, message: 'Fallo al obtener el precio actual de la API de BitMart.' });
        }

        // Paso 2: Calcular el estado inicial con el precio real
        const initialState = calculateInitialState(config, currentPrice);

        let autobot = await Autobot.findOne({ user: userId });
        if (!autobot) {
            autobot = new Autobot({
                user: userId,
                config: { ...config, ...initialState }
            });
        } else {
            // Actualizar la configuración y el estado inicial del bot
            autobot.config = { ...autobot.config, ...config, ...initialState };
        }
        
        // Actualizar el estado del bot a 'RUNNING'
        autobot.lstate = 'RUNNING';
        autobot.sstate = 'RUNNING';

        await autobot.save();
        
        console.log('[BACKEND LOG]: Autobot strategies started and saved.');

        res.json({ success: true, message: 'Autobot strategies started.' });

    } catch (error) {
        console.error('Failed to start Autobot strategies:', error);
        res.status(500).json({ success: false, message: 'Failed to start Autobot strategies.' });
    }
});

router.post('/stop', async (req, res) => {
    try {
        const botState = await Autobot.findOne({});
        if (botState) {
            botState.lstate = 'STOPPED';
            botState.sstate = 'STOPPED';
            botState.config.long.enabled = false;
            botState.config.short.enabled = false;
            await botState.save();

            console.log(`[BACKEND LOG]: Bot detenido y estado guardado en la DB: lstate: ${botState.lstate}, sstate: ${botState.sstate}`); 
            
            autobotLogic.log('Autobot strategy stopped by user.', 'info');
            res.json({ success: true, message: 'Autobot strategy stopped.' });
        } else {
            res.status(404).json({ success: false, message: 'Bot state not found.' });
        }
    } catch (error) {
        console.error('Failed to stop Autobot strategy:', error);
        res.status(500).json({ success: false, message: 'Failed to stop Autobot strategy.' });
    }
});

// Ruta para actualizar la configuración del bot
router.post('/update-config', auth, async (req, res) => {
    try {
        const { config } = req.body;
        const userId = req.user.id;
        const symbol = config.symbol;

        if (!symbol) {
            return res.status(400).json({ success: false, message: 'El símbolo del trading no está especificado.' });
        }

        // Usamos la función getTicker de tu servicio existente
        const tickerData = await bitmartService.getTicker(symbol);
        const currentPrice = parseFloat(tickerData.last_price);

        if (isNaN(currentPrice)) {
            return res.status(503).json({ success: false, message: 'Fallo al obtener el precio actual de la API de BitMart.' });
        }

        const initialState = calculateInitialState(config, currentPrice);

        let autobot = await Autobot.findOne({ user: userId });
        if (!autobot) {
            autobot = new Autobot({
                user: userId,
                config: { ...config, ...initialState }
            });
        } else {
            autobot.config = { ...config, ...initialState };
        }

        await autobot.save();
        res.json({ success: true, message: 'Configuración y estado inicial actualizados con éxito.', data: { initialState, currentPrice } });
    } catch (error) {
        console.error('Error al actualizar la configuración del bot:', error);
        res.status(500).json({ success: false, message: 'Error del servidor al actualizar la configuración.' });
    }
});

module.exports = router;