// BSB/server/controllers/configController.js (NUEVO ARCHIVO CREADO)

const Autobot = require('../models/Autobot'); 
const bitmartService = require('../services/bitmartService'); 
const { log, getBotState } = require('../autobotLogic'); // Importamos solo lo necesario del Logic
const { updateGeneralBotState } = require('../autobotLogic'); 
const { calculateLongCoverage, parseNumber } = require('../autobotCalculations'); 

/**
 * Función que maneja la actualización de la configuración del bot, la validación
 * de balances y el recálculo dinámico de lcoverage/lnorder.
 */
async function updateBotConfig(req, res) {
    try {
        const newConfig = req.body; 
        
        // --- 1. IDENTIFICAR LOS CAMPOS DE CAPITAL ASIGNADO Y OBTENER ESTADO ---
        const assignedUSDT = parseFloat(newConfig.long?.amountUsdt || 0); 
        const assignedBTC = parseFloat(newConfig.short?.amountBtc || 0); 

        let botState = await getBotState();
        const isNewBot = !botState;

        // --- 2. OBTENER SALDOS REALES DE BITMART (Necesario para la validación) ---
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
        
        // ---------------------------------------------------------------------------------
        // 💡 LÓGICA DE RECALCULO DE LCOVERAGE Y LNORDER (Trigger)
        // ---------------------------------------------------------------------------------
        let recalculateCoverage = false;

        if (!isNewBot) {
            const oldPurchaseUsdt = parseFloat(botState.config.long.purchaseUsdt);
            const newPurchaseUsdt = parseFloat(newConfig.long.purchaseUsdt);
            
            if (oldPurchaseUsdt !== newPurchaseUsdt) {
                const isBotStopped = botState.lstate === 'STOPPED';
                const isPositionEmpty = (botState.lStateData.ppc || 0) === 0;

                if (isBotStopped || isPositionEmpty) {
                    recalculateCoverage = true;
                }
            }
        } else {
            // Si es un bot nuevo, siempre recalculamos la cobertura inicial
            recalculateCoverage = true; 
        }
        // ---------------------------------------------------------------------------------


        // --- 4. CARGAR ESTADO Y APLICAR LÓGICA DE ASIGNACIÓN DE BALANCE/CONFIGURACIÓN ---
        
        if (isNewBot) {
            // Inicializar un nuevo bot
            botState = new Autobot({ 
                config: newConfig,
                lbalance: assignedUSDT, 
                sbalance: assignedBTC, 
            });
            log('Primer estado del bot inicializado.', 'success');

        } else {
            
            // Asignación de Balance solo si está STOPPED
            if (botState.lstate === 'STOPPED') {
                 botState.lbalance = assignedUSDT; 
                 log(`LBalance reinicializado a ${assignedUSDT.toFixed(2)} USDT.`, 'info');
            }
            if (botState.sstate === 'STOPPED') {
                 botState.sbalance = assignedBTC;
                 log(`SBalance reinicializado a ${assignedBTC.toFixed(8)} BTC.`, 'info');
            }

            // Fusión de la Configuración
            botState.config.long = { ...(botState.config.long?.toObject() || {}), ...newConfig.long };
            botState.config.short = { ...(botState.config.short?.toObject() || {}), ...newConfig.short };
            Object.assign(botState.config, newConfig);
            botState.markModified('config'); 
        }
        
        // --- 5. RECALCULO Y PERSISTENCIA DE COBERTURA (lcoverage/lnorder) ---

        if (recalculateCoverage) {
            const balanceForCalc = isNewBot ? assignedUSDT : botState.lbalance;
            const purchaseUsdtForCalc = parseFloat(newConfig.long.purchaseUsdt);
            
            // Usar el PPC si existe, si no, 1 como referencia segura.
            const referencePrice = (botState.lStateData?.ppc || 0) > 0 ? botState.lStateData.ppc : 1; 
            
            const priceVarDecimal = parseNumber(newConfig.long.price_var) / 100;
            const sizeVarDecimal = parseNumber(newConfig.long.size_var) / 100;
            
            const { coveragePrice: newLCoverage, numberOfOrders: newLNOrder } = calculateLongCoverage(
                balanceForCalc,      
                referencePrice,       
                purchaseUsdtForCalc, 
                priceVarDecimal,
                sizeVarDecimal
            );

            // Asignar los nuevos valores antes de guardar
            botState.lcoverage = newLCoverage;
            botState.lnorder = newLNOrder;
            
            log(`Nuevos targets de cobertura base: ${newLNOrder} órdenes hasta ${newLCoverage.toFixed(2)} USD.`, 'success');
        }
        
        // 6. Guardar todos los cambios (Config, lbalance/sbalance, lcoverage, lnorder)
        await botState.save();

        log('Configuración guardada y balances de estrategia actualizados.', 'success');
        
        // 7. Devolver el estado actual
        const updatedBotState = await getBotState();
        return res.json({ success: true, message: 'Configuración y balances de estrategia actualizados.', botState: updatedBotState });

    } catch (error) {
        log(`Error al actualizar la configuración: ${error.message}`, 'error');
        return res.status(500).json({ success: false, message: 'Error interno del servidor al actualizar la configuración.' });
    }
}

async function getBotConfig(req, res) {
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
}


module.exports = { 
    updateBotConfig,
    getBotConfig 
};