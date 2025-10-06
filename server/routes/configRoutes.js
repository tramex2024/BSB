// /BSB/server/routes/configRoutes.js

const express = require('express');
const router = express.Router();
const Autobot = require('../models/Autobot'); 
const bitmartService = require('../services/bitmartService'); 
const { log } = require('../autobotLogic'); 

// Ruta GET: Obtiene la configuración actual del bot
router.get('/', async (req, res) => {
    try {
        const botState = await Autobot.findOne({});
        if (!botState) {
            return res.status(404).json({ success: false, message: 'No se encontró el estado inicial del bot.' });
        }
        res.json({ success: true, config: botState.config });
    } catch (error) {
        log(`Error al obtener la configuración: ${error.message}`, 'error');
        res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
});

// Ruta POST: Actualiza la configuración con validación y establece LBalance/SBalance
router.post('/', async (req, res) => {
    try {
        const newConfig = req.body;
        
        // --- 1. IDENTIFICAR LOS CAMPOS DE CAPITAL ASIGNADO ---
        // Utilizamos valores seguros para evitar NaN en validación
        const assignedUSDT = parseFloat(newConfig.long?.amountUsdt || 0); 
        const assignedBTC = parseFloat(newConfig.short?.amountBtc || 0);  

        // --- 2. OBTENER SALDOS REALES DE BITMART ---
        // NOTA: Asumimos que getAvailableTradingBalances se encarga de las credenciales
        const { availableUSDT, availableBTC } = await bitmartService.getAvailableTradingBalances();

        // --- 3. VALIDACIÓN CRÍTICA DE FONDOS ---
        
        if (assignedUSDT > availableUSDT) {
            const msg = `Error: Asignación de USDT (${assignedUSDT.toFixed(2)}) excede el saldo real disponible (${availableUSDT.toFixed(2)}).`;
            log(msg, 'error');
            return res.status(400).json({ success: false, message: msg });
        }

        if (assignedBTC > availableBTC) {
            const msg = `Error: Asignación de BTC (${assignedBTC.toFixed(8)}) excede el saldo real disponible (${availableBTC.toFixed(8)}).`;
            log(msg, 'error');
            return res.status(400).json({ success: false, message: msg });
        }
        
        // --- 4. CARGAR ESTADO Y APLICAR LÓGICA DE INICIALIZACIÓN/ACTUALIZACIÓN ---
        let botState = await Autobot.findOne({});
        const isNewBot = !botState;
        
        if (isNewBot) {
            // Inicializar un nuevo bot
            botState = new Autobot({ 
                config: newConfig,
                lbalance: assignedUSDT, 
                sbalance: assignedBTC,  
            });
            log('Primer estado del bot inicializado con la configuración y balances.', 'success');

        } else {
            
            // Lógica de Inicialización/Reasignación de LBalance y SBalance:
            if (botState.lstate === 'STOPPED') {
                 botState.lbalance = assignedUSDT;
                 log(`LBalance reinicializado a ${assignedUSDT.toFixed(2)} USDT.`, 'info');
            }
            if (botState.sstate === 'STOPPED') {
                 botState.sbalance = assignedBTC;
                 log(`SBalance reinicializado a ${assignedBTC.toFixed(8)} BTC.`, 'info');
            }

            // 💡 CRÍTICO: FUSIÓN DE CONFIGURACIÓN para evitar borrar campos
            // Usamos Object.assign para fusionar las propiedades anidadas (long y short)

            if (newConfig.long) {
                // Fusiona los cambios de 'long' (incluido profit_percent)
                botState.config.long = Object.assign(botState.config.long || {}, newConfig.long);
            }
            
            if (newConfig.short) {
                // Fusiona los cambios de 'short'
                botState.config.short = Object.assign(botState.config.short || {}, newConfig.short);
            }

            // Actualiza otras propiedades de nivel superior (como 'symbol')
            // Esto asegura que la config general también se actualice si el front la envía.
            delete newConfig.long; // Eliminamos la propiedad long del nivel superior
            delete newConfig.short; // Eliminamos la propiedad short del nivel superior
            botState.config = Object.assign(botState.config, newConfig);

        }
        
        await botState.save();

        log('Configuración guardada y LBalance/SBalance actualizado según el estado.', 'success');
        res.json({ success: true, message: 'Configuración y balances de estrategia actualizados.' });

    } catch (error) {
        log(`Error al actualizar la configuración: ${error.message}`, 'error');
        res.status(500).json({ success: false, message: 'Error interno del servidor al actualizar la configuración.' });
    }
});

module.exports = router;