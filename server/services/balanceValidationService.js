// BSB/server/src/controllers/botController.js

const BalanceValidationService = require('../services/balanceValidationService');
const { placePreShortBtcPurchase } = require('../services/bitmartService'); // Función para compra mercado

/**
 * Endpoint: POST /api/bot/start
 */
async function startBot(req, res) {
    const { userId, strategyType, config } = req.body;
    const userCreds = await getUserCreds(userId);
    const currentBotState = await getBotStateFromDB(userId);

    try {
        // 1. VALIDACIÓN GLOBAL DE SOLVENCIA
        const validation = await BalanceValidationService.validateStartStrategy(
            userId, 
            strategyType, 
            config, 
            currentBotState, 
            userCreds
        );

        if (!validation.isSolvent) {
            return res.status(400).json({ 
                error: 'Insufficient total USDT balance to cover all active strategies.' 
            });
        }

        // 2. CASO ESPECIAL: PRE-APROVISIONAMIENTO DE BTC PARA SHORT
        if (strategyType === 'short' && validation.details.needsBtcProvision) {
            console.log(`[PRE-FLIGHT] Buying ${validation.details.btcToBuy} BTC for Short initialization...`);
            
            // Ejecutamos la compra a mercado del BTC faltante
            const purchaseResult = await placePreShortBtcPurchase(
                config.symbol, 
                validation.details.btcToBuy, 
                userCreds
            );

            if (!purchaseResult.success) {
                return res.status(500).json({ error: 'Failed to acquire initial BTC for Short strategy.' });
            }
        }

        // 3. ACTIVACIÓN DEL BOT
        // Seteamos el estado a RUNNING y actualizamos la configuración
        await updateBotInDB(userId, {
            state: 'RUNNING', // <--- Siempre inicia en RUNNING como mencionaste
            [`config.${strategyType}`]: config[strategyType],
            // Si es la primera vez, inicializamos el balance específico
            [`${strategyType === 'short' ? 's' : 'l'}balance`]: config[strategyType].purchaseUsdt
        });

        return res.json({ success: true, message: 'Bot started in RUNNING state.' });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}