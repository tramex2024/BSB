/// backend/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const bitmartAuthMiddleware = require('../middleware/bitmartAuthMiddleware'); // Necesario para otras rutas
const bitmartService = require('../services/bitmartService');
const User = require('../models/User');
const { encrypt } = require('../utils/encryption'); // Importa la función de encriptación

// Ruta para guardar y validar las API keys de BitMart
router.post('/save-api-keys', authMiddleware, async (req, res) => {
    const { apiKey, secretKey, apiMemo } = req.body;
    const userId = req.user.id;

    if (!apiKey || !secretKey || !apiMemo) {
        return res.status(400).json({ message: 'API Key, Secret Key y API Memo son requeridos.' });
    }

    try {
        // Paso 1: Validar las claves con BitMart usando el texto plano recibido
        const isValid = await bitmartService.validateApiKeys(apiKey, secretKey, apiMemo);

        if (!isValid) {
            return res.status(400).json({ message: 'Las credenciales de BitMart API son inválidas o la conexión falló. Por favor, revísalas.' });
        }

        // Paso 2: Encriptar la secretKey antes de guardarla
        const encryptedSecretKey = encrypt(secretKey);

        // Paso 3: Guardar las claves (con la secretKey encriptada) en MongoDB
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }

        user.bitmartApiKey = apiKey;
        user.bitmartSecretKeyEncrypted = encryptedSecretKey; // Guarda la clave encriptada
        user.bitmartApiMemo = apiMemo;
        await user.save();

        res.status(200).json({ message: 'API keys validadas y guardadas con éxito.', connected: true });

    } catch (error) {
        console.error('Error al guardar o validar API keys:', error);
        res.status(500).json({ message: 'Error interno del servidor al procesar las API keys.', connected: false });
    }
});

// Ruta para obtener el balance del usuario (requiere credenciales de BitMart)
router.get('/bitmart/balance', authMiddleware, bitmartAuthMiddleware, async (req, res) => {
    try {
        // req.bitmartCreds contiene { apiKey, secretKey (desencriptada), apiMemo }
        const balance = await bitmartService.getBalance(req.bitmartCreds);
        res.json(balance);
    } catch (error) {
        console.error('Error al obtener balance de BitMart:', error);
        res.status(500).json({ message: 'Error al obtener balance de BitMart.', error: error.message });
    }
});

// Ruta para obtener órdenes abiertas del usuario (requiere credenciales de BitMart)
router.get('/bitmart/open-orders', authMiddleware, bitmartAuthMiddleware, async (req, res) => {
    try {
        const symbol = req.query.symbol; // Opcional, si quieres filtrar por símbolo
        const openOrders = await bitmartService.getOpenOrders(req.bitmartCreds, symbol);
        res.json(openOrders);
    } catch (error) {
        console.error('Error al obtener órdenes abiertas de BitMart:', error);
        res.status(500).json({ message: 'Error al obtener órdenes abiertas de BitMart.', error: error.message });
    }
});

// Ruta para colocar una orden (requiere credenciales de BitMart)
router.post('/bitmart/place-order', authMiddleware, bitmartAuthMiddleware, async (req, res) => {
    const { symbol, side, type, size, price } = req.body;
    try {
        const orderResult = await bitmartService.placeOrder(req.bitmartCreds, symbol, side, type, size, price);
        res.status(200).json(orderResult);
    } catch (error) {
        console.error('Error al colocar orden en BitMart:', error);
        res.status(500).json({ message: 'Error al colocar orden en BitMart.', error: error.message });
    }
});

// Añade más rutas aquí que necesiten las credenciales de BitMart (ej. cancelar orden, historial, etc.)
// router.post('/bitmart/cancel-order', authMiddleware, bitmartAuthMiddleware, async (req, res) => { ... });
// router.get('/bitmart/history-orders', authMiddleware, bitmartAuthMiddleware, async (req, res) => { ... });

module.exports = router;