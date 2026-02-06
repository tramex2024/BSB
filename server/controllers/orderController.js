const bitmartService = require('../services/bitmartService');

exports.getOrders = async (req, res) => {
    const { status } = req.params;
    
    if (!status) {
        return res.status(400).json({ success: false, message: 'Missing "status" parameter.' });
    }

    try {
        let ordersToReturn = [];
        const symbol = 'BTC_USDT';

        switch (status) {
            case 'opened':
                // Para órdenes abiertas seguimos esperando la estructura de objeto del servicio
                const openRes = await bitmartService.getOpenOrders(symbol);
                ordersToReturn = openRes.orders || openRes.data || (Array.isArray(openRes) ? openRes : []);
                break;

            case 'filled':
            case 'cancelled':
            case 'all':
                const endTime = Date.now();
                const ninetyDaysAgo = endTime - (90 * 24 * 60 * 60 * 1000);
                
                const historyParams = {
                    symbol: symbol,
                    orderMode: 'spot',
                    startTime: ninetyDaysAgo,
                    endTime: endTime,
                    limit: 200 // Mantenemos el límite alto para capturar más días
                };
                
                if (status !== 'all') {
                    historyParams.order_state = status;
                }
                
                // IMPORTANTE: El servicio ya devuelve un Array mapeado.
                ordersToReturn = await bitmartService.getHistoryOrders(historyParams);
                break;
                
            default:
                return res.status(400).json({ success: false, message: 'Invalid order status' });
        }

        // Enviamos el array directamente. El frontend ahora recibirá [ {...}, {...} ]
        res.status(200).json(ordersToReturn);
        
    } catch (error) {
        console.error('Error al obtener órdenes:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};