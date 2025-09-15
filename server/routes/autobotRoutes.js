// server/routes/autobotRoutes.js

const express = require('express');
const router = express.Router();
const Autobot = require('../models/Autobot');
const autobotLogic = require('../autobotLogic.js');
const { calculateInitialState } = require('../autobotCalculations');
const authMiddleware = require('../middleware/authMiddleware'); // Asegúrate de que este archivo exista

// Middleware para proteger todas las rutas del router
router.use(authMiddleware);

router.post('/start', async (req, res) => {
    try {
        const { long, short, options } = req.body;
        let botState = await Autobot.findOne({});
        
        if (!botState) {
            botState = new Autobot({
                lstate: 'STOPPED',
                sstate: 'STOPPED',
                config: {
                    long: { ...long, enabled: true },
                    short: { ...short, enabled: true },
                    stopAtCycle: options.stopAtCycleEnd
                },
                lbalance: long.purchaseUsdt,  
                sbalance: 0,
                profit: 0
            });
        } else {
            botState.config.long = { ...botState.config.long, ...long, enabled: true };
            botState.config.short = { ...botState.config.short, ...short, enabled: true };
            botState.config.stopAtCycle = options.stopAtCycleEnd;
            botState.lstate = 'RUNNING';
            botState.sstate = 'RUNNING';
            botState.lbalance = botState.config.long.purchaseUsdt;
        }

        await botState.save();

        autobotLogic.log('Ambas estrategias de Autobot (Long y Short) activadas.', 'success');
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

router.post('/update-config', async (req, res) => {
    try {
        const { config } = req.body;

        // **PASO 1: Simular el precio actual del mercado**
        // Este valor debe ser el precio real de BitMart cuando lo implementemos.
        const currentPrice = 100000; 
        
        // **PASO 2: Llamar a la función de cálculo**
        // Ahora pasamos la configuración y el precio actual a la función.
        const initialState = calculateInitialState(config, currentPrice);

        let botState = await Autobot.findOne({});
        
        if (!botState) {
            // Si el documento no existe, creamos uno nuevo con los valores iniciales calculados
            botState = new Autobot({
                lStateData: initialState,
                sStateData: {}, // Por ahora está vacío, pero se llenará después
                config: config,
                lbalance: initialState.lbalance,
                sbalance: initialState.sbalance,
                lstate: 'STOPPED',
                sstate: 'STOPPED',
                profit: 0
            });
        } else {
            // Si ya existe un documento, lo actualizamos
            botState.config = config;

            // **PASO 3: Actualizar los campos calculados si el bot está detenido**
            if (botState.lstate === 'STOPPED') {
                botState.lbalance = initialState.lbalance;
                botState.sbalance = initialState.sbalance;
                botState.lStateData.lcoverage = initialState.lcoverage;
                botState.lStateData.lnorder = initialState.lnorder;
                
                // Estos valores se inicializan al inicio de un ciclo de trading
                botState.lStateData.ltprice = 0;
                botState.lStateData.lcycle = 0;
            }
        }

        await botState.save();

        res.status(200).json({ success: true, message: 'Bot configuration updated successfully.' });
    } catch (error) {
        console.error('Failed to update bot configuration:', error);
        res.status(500).json({ success: false, message: 'Failed to update bot configuration.' });
    }
});

module.exports = router;