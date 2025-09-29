// /BSB/server/routes/balanceRoutes.js

const express = require('express');
const router = express.Router();
const bitmartService = require('../services/bitmartService'); // Necesita acceso a la función de balances
const { log } = require('../autobotLogic'); // Para registrar errores si falla

// Ruta GET: Obtiene los balances de trading disponibles (USDT y BTC)
router.get('/available', async (req, res) => {
    try {
        // En un entorno de producción, aquí deberías validar el token del usuario (req.user)
        // para asegurar que solo los usuarios autenticados llamen a este endpoint,
        // aunque el bitmartService ya depende de las variables de entorno del servidor.
        
        const balances = await bitmartService.getAvailableTradingBalances();
        
        // Devolvemos los saldos reales para que el frontend pueda usarlos como límites
        res.json({ success: true, balances });
        
    } catch (error) {
        // Usamos la función log de autobotLogic para mantener la coherencia con tu aplicación
        log(`Error al obtener los balances disponibles para el frontend: ${error.message}`, 'error');
        
        // Devolvemos saldos de 0 si hay un fallo de API para evitar asignaciones erróneas
        res.status(500).json({ 
            success: false, 
            message: 'Error al conectar con BitMart para obtener saldos. Verifica tus claves API.',
            balances: { availableUSDT: 0, availableBTC: 0 }
        });
    }
});

module.exports = router;