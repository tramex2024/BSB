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
// Comentamos esta línea para desactivar la autenticación temporalmente.

router.use(authMiddleware);

router.post('/start', async (req, res) => {
    try {
        const { config } = req.body;
        const symbol = config.symbol;

        if (!symbol) {
            return res.status(400).json({ success: false, message: 'El símbolo del trading no está especificado.' });
        }

        const tickerData = await bitmartService.getTicker(symbol);
        const currentPrice = parseFloat(tickerData.last_price);

        if (isNaN(currentPrice)) {
            return res.status(503).json({ success: false, message: 'Fallo al obtener el precio actual de la API de BitMart.' });
        }

        const initialState = calculateInitialState(config, currentPrice);

        let autobot = await Autobot.findOne({});
        if (!autobot) {
            autobot = new Autobot({
                config: { ...config, ...initialState }
            });
        } else {
            autobot.config = { ...autobot.config, ...config, ...initialState };
        }

        autobot.lstate = 'RUNNING';
        autobot.sstate = 'RUNNING';

        await autobot.save();
        
        if (autobotLogic.io) {
            autobotLogic.io.emit('bot-state-update', autobot.toObject());
            console.log('[BACKEND LOG]: Estado del bot emitido (al iniciar) a través de Socket.IO.');
        }

        console.log('[BACKEND LOG]: Autobot strategies started and saved.');

        res.json({ success: true, message: 'Autobot strategies started.' });

    } catch (error) {
        console.error('Failed to start Autobot strategies:', error);
        // Manejo específico para el error de BitMart
        if (error.message.includes('Symbol not found')) {
            return res.status(400).json({ success: false, message: 'El símbolo de trading no es válido o no se encuentra en BitMart. Por favor, verifica el símbolo de la configuración.' });
        }
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
            
            // Emite el estado actualizado al detener el bot
            if (autobotLogic.io) {
                autobotLogic.io.emit('bot-state-update', botState.toObject());
                console.log('[BACKEND LOG]: Estado del bot emitido (al detener) a través de Socket.IO.');
            }

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
router.post('/update-config', async (req, res) => {
    try {
        const { config } = req.body;
        const symbol = config.symbol;

        // 🚨 AGREGAR ESTAS LÍNEAS PARA DIAGNÓSTICO
        console.log('--- DIAGNÓSTICO DE CONFIGURACIÓN RECIBIDA ---');
        console.log('Configuración Long:', config.long);
        console.log('Configuración Short:', config.short);
        console.log('-------------------------------------------');

        if (!symbol) {
            return res.status(400).json({ success: false, message: 'El símbolo del trading no está especificado.' });
        }

        const tickerData = await bitmartService.getTicker(symbol);
        const currentPrice = parseFloat(tickerData.last_price);

        if (isNaN(currentPrice)) {
            return res.status(503).json({ success: false, message: 'Fallo al obtener el precio actual de la API de BitMart.' });
        }

        const initialState = calculateInitialState(config, currentPrice);

        let autobot = await Autobot.findOne({});
        if (!autobot) {
            // Si el bot no existe, lo creamos con todos los valores iniciales.
            autobot = new Autobot({
                config: config,
                lstate: 'STOPPED', 
                sstate: 'STOPPED',
                lbalance: initialState.lbalance,
                sbalance: initialState.sbalance,
                lcoverage: initialState.lcoverage,
                scoverage: initialState.scoverage,
                lnorder: initialState.lnorder,
                snorder: initialState.snorder,
                profit: initialState.profit
            });
        } else {
            // Si el bot existe, actualizamos solo la configuración y los valores calculados.
            autobot.config = config;
            autobot.lcoverage = initialState.lcoverage;
            autobot.lnorder = initialState.lnorder;
            autobot.scoverage = initialState.scoverage;
            autobot.snorder = initialState.snorder;
            
            // Si el bot está detenido, actualizamos los balances con los valores de la configuración.
            if (autobot.lstate === 'STOPPED') {
                autobot.lbalance = initialState.lbalance;
            }
            if (autobot.sstate === 'STOPPED') {
                autobot.sbalance = initialState.sbalance;
            }
        }

        await autobot.save();

        console.log('[BACKEND LOG]: Configuración y estado inicial actualizados en la DB.');
        
        if (autobotLogic.io) {
            autobotLogic.io.emit('bot-state-update', autobot.toObject());
            console.log('[BACKEND LOG]: Estado del bot emitido (al actualizar config) a través de Socket.IO.');
        }

        res.json({ success: true, message: 'Configuración y estado inicial actualizados con éxito.', data: autobot.toObject() });

    } catch (error) {
        console.error('Error al actualizar la configuración del bot:', error);
        if (error.message.includes('Symbol not found')) {
            return res.status(400).json({ success: false, message: 'El símbolo de trading no es válido o no se encuentra en BitMart. Por favor, verifica el símbolo de la configuración.' });
        }
        res.status(500).json({ success: false, message: 'Error del servidor al actualizar la configuración.' });
    }
});

module.exports = router;