/**
 * BSB/server/controllers/bitmartController.js
 * CONTROLADOR DE ESTADO DE CONEXIÓN Y MERCADO
 */

const bitmartService = require('../services/bitmartService');

/**
 * Verifica el estado de la conexión con BitMart.
 * Si se invoca con credenciales (vía middleware), valida las llaves.
 * Si no, valida solo el estado del servidor de BitMart (Público).
 */
exports.getBitMartStatus = async (req, res) => {
    try {
        // 1. Verificamos el precio de BTC (Público) para confirmar que la API responde
        const ticker = await bitmartService.getTicker('BTC_USDT');
        
        if (!ticker || !ticker.last_price) {
            throw new Error("Could not fetch market data from BitMart");
        }

        let authStatus = "Public connection active";

        // 2. Si el middleware inyectó credenciales, intentamos una validación privada ligera
        if (req.bitmartCreds) {
            const isValid = await bitmartService.validateApiKeys(req.bitmartCreds);
            authStatus = isValid ? "Authenticated (Keys OK)" : "Invalid Credentials";
        }

        res.status(200).json({ 
            success: true, 
            message: "BitMart connection operational", 
            authStatus,
            data: {
                serverTime: Date.now(),
                marketPrice: parseFloat(ticker.last_price)
            } 
        });

    } catch (error) {
        console.error(`[BITMART-CONTROLLER] Error: ${error.message}`);
        res.status(503).json({ 
            success: false, 
            message: "BitMart service temporarily unavailable",
            error: error.message 
        });
    }
};