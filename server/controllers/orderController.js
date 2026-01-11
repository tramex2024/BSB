// server/controllers/orderController.js

const bitmartService = require('../services/bitmartService');

exports.getOrders = async (req, res) => {
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
                console.log('[Backend - OBSOLETO]: La consulta de órdenes abiertas debe usar ahora WebSockets.');
                return res.status(200).json([]); 
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
                    historyParams.order_state = status;
                }
                
                result = await bitmartService.getHistoryOrders(historyParams);
                break;
                
            default:
                return res.status(400).json({ success: false, message: 'Invalid order status parameter' });
        }

        const ordersToReturn = result && result.data ? result.data : result;
        res.status(200).json(ordersToReturn);
        
    } catch (error) {
        console.error('Error al obtener órdenes:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};