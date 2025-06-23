// backend/routes/userRoutes.js
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
    const userId = req.user.id; // Ya sabemos que req.user.id funciona bien

    if (!apiKey || !secretKey || !apiMemo) {
        console.warn('[save-api-keys] API Key, Secret Key o API Memo faltan.'); // Log para ver si los datos llegan incompletos
        return res.status(400).json({ message: 'API Key, Secret Key y API Memo son requeridos.' });
    }

    try {
        console.log('[save-api-keys] Intentando validar claves con BitMart...'); // Log antes de la validación
        // Paso 1: Validar las claves con BitMart usando el texto plano recibido
        const isValid = await bitmartService.validateApiKeys(apiKey, secretKey, apiMemo);

        if (!isValid) {
            console.warn('[save-api-keys] Validación de credenciales de BitMart fallida.'); // Log si la validación falla
            return res.status(400).json({ message: 'Las credenciales de BitMart API son inválidas o la conexión falló. Por favor, revísalas.' });
        }
        console.log('[save-api-keys] Credenciales de BitMart validadas con éxito.'); // Log si la validación es exitosa

        // Paso 2: Encriptar la secretKey antes de guardarla
        const encryptedSecretKey = encrypt(secretKey);
        console.log('[save-api-keys] Secret Key encriptada. Longitud:', encryptedSecretKey.length); // Log para ver la clave encriptada

        // Paso 3: Guardar las claves (con la secretKey encriptada) en MongoDB
        const user = await User.findById(userId);
        if (!user) {
            console.error('[save-api-keys] Usuario no encontrado para ID:', userId); // Log si el usuario no existe
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }

        user.bitmartApiKey = apiKey;
        user.bitmartSecretKeyEncrypted = encryptedSecretKey; // Guarda la clave encriptada
        user.bitmartApiMemo = apiMemo;
        user.bitmartApiValidated = true; // Asegúrate de que esta línea esté presente para marcar como validado
        
        await user.save();
        console.log('[save-api-keys] Usuario y API keys guardadas en la DB para:', userId); // Log de guardado exitoso

        res.status(200).json({ message: 'API keys validadas y guardadas con éxito.', connected: true });

    } catch (error) {
        console.error('Error al guardar o validar API keys (en userRoutes):', error); // Log detallado del error
        res.status(500).json({ message: 'Error interno del servidor al procesar las API keys.', connected: false });
    }
});

// Ruta para obtener el balance del usuario (requiere credenciales de BitMart)
router.get('/bitmart/balance', authMiddleware, bitmartAuthMiddleware, async (req, res) => {
    try {
        console.log('[getBitmartBalance] Obteniendo balance para usuario:', req.user.id); // Log de inicio
        // req.bitmartCreds contiene { apiKey, secretKey (desencriptada), apiMemo }
        const balance = await bitmartService.getBalance(req.bitmartCreds);
        console.log('[getBitmartBalance] Balance obtenido con éxito.'); // Log de éxito
        res.json(balance);
    } catch (error) {
        console.error('Error al obtener balance de BitMart (en userRoutes):', error); // Log detallado del error
        res.status(500).json({ message: 'Error al obtener balance de BitMart.', error: error.message });
    }
});

// Ruta para obtener órdenes abiertas del usuario (requiere credenciales de BitMart)
router.get('/bitmart/open-orders', authMiddleware, bitmartAuthMiddleware, async (req, res) => {
    try {
        console.log('[getBitmartOpenOrders] Obteniendo órdenes abiertas para usuario:', req.user.id); // Log de inicio
        const symbol = req.query.symbol; // Opcional, si quieres filtrar por símbolo
        const openOrders = await bitmartService.getOpenOrders(req.bitmartCreds, symbol);
        console.log('[getBitmartOpenOrders] Órdenes abiertas obtenidas con éxito.'); // Log de éxito
        res.json(openOrders);
    } catch (error) {
        console.error('Error al obtener órdenes abiertas de BitMart (en userRoutes):', error); // Log detallado del error
        res.status(500).json({ message: 'Error al obtener órdenes abiertas de BitMart.', error: error.message });
    }
});

// Ruta para colocar una orden (requiere credenciales de BitMart)
router.post('/bitmart/place-order', authMiddleware, bitmartAuthMiddleware, async (req, res) => {
    const { symbol, side, type, size, price } = req.body;
    try {
        console.log('[placeOrder] Colocando orden para usuario:', req.user.id); // Log de inicio
        const orderResult = await bitmartService.placeOrder(req.bitmartCreds, symbol, side, type, size, price);
        console.log('[placeOrder] Orden colocada con éxito.'); // Log de éxito
        res.status(200).json(orderResult);
    } catch (error) {
        console.error('Error al colocar orden en BitMart (en userRoutes):', error); // Log detallado del error
        res.status(500).json({ message: 'Error al colocar orden en BitMart.', error: error.message });
    }
});

// Añade más rutas aquí que necesiten las credenciales de BitMart (ej. cancelar orden, historial, etc.)
// router.post('/bitmart/cancel-order', authMiddleware, bitmartAuthMiddleware, async (req, res) => { ... });
// router.get('/bitmart/history-orders', authMiddleware, bitmartAuthMiddleware, async (req, res) => { ... });

module.exports = router;