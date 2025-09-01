// server/controllers/orderController.js

const bitmartService = require('../services/bitmartService');
const Order = require('../models/Order'); // Mantén el modelo si lo usas para otros fines

exports.getOrders = async (req, res) => {
    // El frontend envía el tipo de orden en un "query parameter" llamado 'type'
    const { type } = req.query;

    console.log(`[Backend]: Intentando obtener órdenes de tipo: ${type}`);

    if (!type) {
        return res.status(400).json({ success: false, message: 'Missing "type" query parameter.' });
    }

    try {
        let result;
        const symbol = 'BTC_USDT'; // El símbolo de trading

        // Determina qué API de Bitmart llamar en base al 'type'
        switch (type) {
            case 'opened':
                // Lógica para obtener órdenes abiertas de la API de Bitmart
                result = await bitmartService.getOpenOrders(symbol);
                break;
            case 'filled':
            case 'cancelled':
            case 'all':
                // Lógica para obtener órdenes históricas de la API de Bitmart
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
                if (type !== 'all') {
                    // Si el tipo es 'filled' o 'cancelled', añade el filtro
                    historyParams.status = type;
                }
                
                result = await bitmartService.getHistoryOrders(historyParams);
                break;
            default:
                // Si el 'type' no coincide con ninguno de los casos anteriores
                return res.status(400).json({ success: false, message: 'Invalid order type' });
        }

        // Envía la respuesta con los datos obtenidos de la API
        res.status(200).json(result);
        
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