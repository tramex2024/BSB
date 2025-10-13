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

// Función de ayuda para serializar y emitir el estado
const emitBotState = (autobot, io) => {
    // Garantizamos que totalProfit sea accesible y tenga un valor.
    autobot.totalProfit = autobot.totalProfit || 0;

    // Convertimos a objeto plano de JS para serialización de Socket.IO
    const botData = autobot.toObject();
    
    // 🛑 Paso Crítico: Forzamos la inclusión del campo que Mongoose a veces ignora
    botData.totalProfit = autobot.totalProfit; 

    console.log(`[BACKEND LOG]: Objeto COMPLETO a emitir: ${JSON.stringify(botData)}`);

    if (io) {
        io.emit('bot-state-update', botData);
        console.log('[BACKEND LOG]: Estado emitido a través de Socket.IO.');
    }
    return botData;
};


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
        
        const botData = emitBotState(autobot, autobotLogic.io);

        console.log('[BACKEND LOG]: Autobot strategies started and saved.');

        res.json({ success: true, message: 'Autobot strategies started.', data: botData });

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

            // Usamos la función de ayuda para serializar y emitir
            const botData = emitBotState(botState, autobotLogic.io);

            autobotLogic.log('Autobot strategy stopped by user.', 'info');
            res.json({ success: true, message: 'Autobot strategy stopped.', data: botData });
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
        const { config, totalProfit } = req.body;
        const symbol = config.symbol;

        if (!symbol) {
            return res.status(400).json({ success: false, message: 'El símbolo del trading no está especificado.' });
        }

        // 🚨 CORRECCIÓN CRÍTICA: Mapear 'trigger' a 'profit_percent'
        if (config.long && config.long.trigger !== undefined) {
            config.long.profit_percent = config.long.trigger;
            delete config.long.trigger; 
        }
        if (config.short && config.short.trigger !== undefined) {
            config.short.profit_percent = config.short.trigger;
            delete config.short.trigger;
        }
        // FIN del mapeo

        const tickerData = await bitmartService.getTicker(symbol);
        const currentPrice = parseFloat(tickerData.last_price);

        if (isNaN(currentPrice)) {
            return res.status(503).json({ success: false, message: 'Fallo al obtener el precio actual de la API de BitMart.' });
        }

        const initialState = calculateInitialState(config, currentPrice);

        let autobot = await Autobot.findOne({});
        if (!autobot) {
            // Si el bot no existe, lo creamos
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
                profit: initialState.profit,
                // Si es nuevo, toma el default del esquema.
            });
        } else {
            // Si el bot existe, actualizamos
            autobot.config = config; 
            autobot.lcoverage = initialState.lcoverage;
            autobot.lnorder = initialState.lnorder;
            autobot.scoverage = initialState.scoverage;
            autobot.snorder = initialState.snorder;
            
            // Actualizar balances solo si está detenido
            if (autobot.lstate === 'STOPPED') {
                autobot.lbalance = initialState.lbalance;
            }
            if (autobot.sstate === 'STOPPED') {
                autobot.sbalance = initialState.sbalance;
            }
        }

        await autobot.save();

        console.log('[BACKEND LOG]: Configuración y estado inicial actualizados en la DB.');
        
        // Usamos la función de ayuda para serializar y emitir
        const botData = emitBotState(autobot, autobotLogic.io);

        res.json({ success: true, message: 'Configuración y estado inicial actualizados con éxito.', data: botData });

    } catch (error) {
        console.error('Error al actualizar la configuración del bot:', error);
        if (error.message.includes('Symbol not found')) {
            return res.status(400).json({ success: false, message: 'El símbolo de trading no es válido o no se encuentra en BitMart. Por favor, verifica el símbolo de la configuración.' });
        }
        res.status(500).json({ success: false, message: 'Error del servidor al actualizar la configuración.' });
    }
});

module.exports = router;
