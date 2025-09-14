// server/controllers/orderController.js

const bitmartService = require('../services/bitmartService');
const Order = require('../models/Order');

exports.getOrders = async (req, res) => {
    // AHORA OBTENEMOS EL TIPO DE ORDEN DE LOS PARÁMETROS DE RUTA
    const { status } = req.params;

    console.log(`[Backend]: Intentando obtener órdenes de tipo: ${status}`);

    if (!status) {
        return res.status(400).json({ success: false, message: 'Missing "status" path parameter.' });
    }

    try {
        let result;
        const symbol = 'BTC_USDT';

        switch (status) {
            case 'opened':
                result = await bitmartService.getOpenOrders(symbol);
                break;
            case 'filled':
            case 'cancelled':
            case 'all':
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
                if (status !== 'all') {
                    historyParams.status = status;
                }
                
                result = await bitmartService.getHistoryOrders(historyParams);
                break;
            default:
                return res.status(400).json({ success: false, message: 'Invalid order status' });
        }

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