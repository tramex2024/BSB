// server/routes/autobotRoutes.js

const express = require('express');
const router = express.Router();
const Autobot = require('../models/Autobot');
const autobotLogic = require('../autobotLogic.js');
const { calculateInitialState } = require('../autobotCalculations');
const authMiddleware = require('../middleware/authMiddleware');
const { getTickerPrice } = require('../utils/bitmartApi');

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

        // **PASO CLAVE: OBTENEMOS EL PRECIO REAL DE BITMART**
        const currentPrice = await getTickerPrice(config.symbol);
        
        // Si no se pudo obtener el precio, devolvemos un error
        if (!currentPrice) {
            return res.status(503).json({ success: false, message: 'Failed to get current price from BitMart API.' });
        }
        
        // Ahora usamos el precio real para los cálculos
        const initialState = calculateInitialState(config, currentPrice);

        let botState = await Autobot.findOne({});
        
        if (!botState) {
            botState = new Autobot({
                lstate: 'STOPPED',
                sstate: 'STOPPED',
                lStateData: {},
                sStateData: {},
                config: config,
                lbalance: initialState.lbalance,
                sbalance: initialState.sbalance,
                lcoverage: initialState.lcoverage,
                lnorder: initialState.lnorder
            });
        } else {
            botState.config = config;

            if (botState.lstate === 'STOPPED') {
                botState.lbalance = initialState.lbalance;
                botState.sbalance = initialState.sbalance;
                botState.lcoverage = initialState.lcoverage;
                botState.lnorder = initialState.lnorder;
                
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