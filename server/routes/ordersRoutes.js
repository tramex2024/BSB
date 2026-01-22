// server/routes/ordersRoutes.js

const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController'); // Importa el controlador
const authMiddleware = require('../middleware/authMiddleware'); // Asegúrate de tener este middleware para proteger la ruta

// Esta ruta ahora aceptará cualquier "status" como un parámetro dinámico
// La ruta completa será: /api/orders/:status
router.get('/:status', authMiddleware, orderController.getOrders);

module.exports = router;                                                // server/controllers/orderController.js

const bitmartService = require('../services/bitmartService');
// Si estás utilizando el modelo 'Order' para guardar el historial, debería ser importado:
// const OrderHistory = require('../models/OrderHistory'); 

exports.getOrders = async (req, res) => {
    // OBTENEMOS EL TIPO DE ORDEN DE LOS PARÁMETROS DE RUTA
    const { status } = req.params;

    console.log(`[Backend]: Intentando obtener órdenes de tipo: ${status}`);

    if (!status) {
        return res.status(400).json({ success: false, message: 'Missing "status" path parameter.' });
    }

    try {
        let result;
        const symbol = 'BTC_USDT'; // Asegúrate de que este sea el símbolo correcto.

        switch (status) {
            case 'opened':
                // 🛑 MODIFICACIÓN: Esta ruta ya NO debe llamar a la API REST.
                console.log('[Backend - OBSOLETO]: La consulta de órdenes abiertas debe usar ahora WebSockets.');
                return res.status(200).json([]); // Devolvemos un array vacío y status 200.
                // result = await bitmartService.getOpenOrders(symbol); // ⬅️ ELIMINAR ESTA LÍNEA
                break; // Ya no necesitamos el break si hacemos return antes.
                
            case 'filled':
            case 'cancelled':
            case 'all':
                // Para el historial, definimos el rango de tiempo (90 días)
                const endTime = Date.now();
                const ninetyDaysAgo = new Date();
                ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
                const startTime = ninetyDaysAgo.getTime();
                
                const historyParams = {
                    symbol: symbol,
                    orderMode: 'spot',
                    startTime: startTime,
                    endTime: endTime,
                    limit: 100 
                };
                
                // 🛑 CORRECCIÓN CRÍTICA: Cambiamos 'status' por 'order_state' 
                // para que BitMart aplique el filtro en su API.
                if (status !== 'all') {
                    historyParams.order_state = status; // ✅ Ahora BitMart filtra por 'filled' o 'cancelled'
                }
                
                result = await bitmartService.getHistoryOrders(historyParams);
                break;
                
            default:
                return res.status(400).json({ success: false, message: 'Invalid order status parameter' });
        }

        // Si la respuesta de BitMart tiene un campo 'data', lo extraemos.
        // Asumimos que BitMart devuelve un array de órdenes o un objeto con un campo 'data' o similar.
        const ordersToReturn = result && result.data ? result.data : result;

        res.status(200).json(ordersToReturn);
        
    } catch (error) {
        console.error('Error al obtener órdenes. Detalles:', error.response ? error.response.data : error.message);
        
        let errorMessage = 'Error al obtener órdenes. Por favor, revisa tus API Keys y los logs del servidor.';
        if (error.response && error.response.data && error.response.data.message) {
            errorMessage = error.response.data.message;
        } else if (error.message) {
            errorMessage = error.message;
        }
        
        res.status(500).json({ success: false, message: errorMessage });
    }
};             