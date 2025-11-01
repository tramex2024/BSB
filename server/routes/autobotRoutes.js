const express = require('express');
const router = express.Router();
const Autobot = require('../models/Autobot');
const autobotLogic = require('../autobotLogic.js');
const { calculateInitialState } = require('../utils/autobotCalculations');
const authMiddleware = require('../middleware/authMiddleware');
const { CLEAN_STRATEGY_DATA, CLEAN_ROOT_FIELDS } = require('../src/utils/cleanState'); // ✅ Importación de la limpieza

// Importamos el servicio centralizado de BitMart
const bitmartService = require('../services/bitmartService');

// Middleware para proteger todas las rutas del router
// Comentamos esta línea para desactivar la autenticación temporalmente.

router.use(authMiddleware);

// Función de ayuda para serializar y emitir el estado
const emitBotState = (autobot, io) => {
    // 🛑 CAMBIO CLAVE: Referenciamos el nuevo campo total_profit
    autobot.total_profit = autobot.total_profit || 0; 

    // Convertimos a objeto plano de JS para serialización de Socket.IO
    const botData = autobot.toObject();
    
    // Paso Crítico: Forzamos la inclusión del campo con el nuevo nombre
    botData.total_profit = autobot.total_profit; 

    // Logging Final para confirmar que el valor va incluido en el JSON emitido
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
        if (!botState) {
            return res.status(404).json({ success: false, message: 'Bot state not found.' });
        }

        const updates = {};
        
        // 1. Deshabilitar y Detener inmediatamente
        updates.lstate = 'STOPPED';
        updates.sstate = 'STOPPED';
        updates['config.long.enabled'] = false;
        updates['config.short.enabled'] = false;

        // ----------------------------------------------------
        // 2. LÓGICA DE CONCILIACIÓN y LIMPIEZA PROFUNDA (Long)
        // ----------------------------------------------------
        const configuredUSDT = parseFloat(botState.config.long.amountUsdt || 0); // $16.00
        const currentLBalance = parseFloat(botState.lbalance || 0);              // $11.00
        const currentLPosition = parseFloat(botState.lStateData.ac || 0);         // 0

        // Si no hay posición abierta Y el balance actual es menor que el configurado (Capital atascado)
        if (currentLPosition === 0 && currentLBalance < configuredUSDT) {
            
            // CONCILIACIÓN CRÍTICA: Forzar lbalance al capital total configurado
            updates.lbalance = configuredUSDT; 

            // Limpieza Profunda: Ya que la posición es 0 y se concilió el balance, 
            // asumimos que el usuario quiere un reset de los datos internos del ciclo.
            updates.lStateData = CLEAN_STRATEGY_DATA;
            updates.ltprice = CLEAN_ROOT_FIELDS.ltprice; // Limpiar Target
            updates.lcycle = CLEAN_ROOT_FIELDS.lcycle;   // Limpiar Ciclo
            
            autobotLogic.log(`[STOP-CONCILIADO] lbalance restablecido a ${configuredUSDT.toFixed(2)} USDT (AC=0).`, 'success');
            
        } else if (currentLPosition === 0) {
            // Si la posición es 0 pero el balance está bien, solo limpiamos los datos del ciclo.
            updates.lStateData = CLEAN_STRATEGY_DATA;
            updates.ltprice = CLEAN_ROOT_FIELDS.ltprice; 
            updates.lcycle = CLEAN_ROOT_FIELDS.lcycle;
        } 
        // NOTA: Si currentLPosition > 0, NO limpiamos lStateData ni conciliamos el balance, 
        // el bot mantiene su posición para ser reanudada.


        // ----------------------------------------------------
        // 3. LÓGICA DE CONCILIACIÓN y LIMPIEZA PROFUNDA (Short)
        // (Se aplica la misma lógica para sbalance/sStateData)
        // ----------------------------------------------------
        const configuredBTC = parseFloat(botState.config.short.amountBtc || 0);
        const currentSBalance = parseFloat(botState.sbalance || 0);
        const currentSPosition = parseFloat(botState.sStateData.ac || 0);

        if (currentSPosition === 0 && currentSBalance < configuredBTC) {
            updates.sbalance = configuredBTC;
            updates.sStateData = CLEAN_STRATEGY_DATA;
            updates.stprice = CLEAN_ROOT_FIELDS.stprice;
            updates.scycle = CLEAN_ROOT_FIELDS.scycle;
            // autobotLogic.log(`[STOP-CONCILIADO] sbalance restablecido a ${configuredBTC.toFixed(8)} BTC (AC=0).`, 'success');
        } else if (currentSPosition === 0) {
            updates.sStateData = CLEAN_STRATEGY_DATA;
            updates.stprice = CLEAN_ROOT_FIELDS.stprice;
            updates.scycle = CLEAN_ROOT_FIELDS.scycle;
        }


        // 4. Guardar las actualizaciones en la DB
        await Autobot.findOneAndUpdate({}, { $set: updates });

        // Obtener el estado actualizado para emitir (con los nuevos valores de lbalance/lStateData)
        const updatedBotState = await Autobot.findOne({});
        const botData = emitBotState(updatedBotState, autobotLogic.io);

        autobotLogic.log('Autobot strategy stopped by user. State and balance reviewed.', 'info');
        res.json({ success: true, message: 'Autobot strategy stopped. State and balance reviewed.', data: botData });
        
    } catch (error) {
        console.error('Failed to stop Autobot strategy:', error);
        res.status(500).json({ success: false, message: 'Failed to stop Autobot strategy.' });
    }
});

router.post('/update-config', async (req, res) => {
    try {
        // 🛑 CAMBIO CLAVE: Usamos total_profit
        const { config, total_profit } = req.body; 
        const symbol = config.symbol;

        if (!symbol) {
            return res.status(400).json({ success: false, message: 'El símbolo del trading no está especificado.' });
        }

        // Mapeo de 'trigger' a 'profit_percent'
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
