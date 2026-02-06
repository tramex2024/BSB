// BSB/server/controllers/orderController.js

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
                console.log('[Backend]: Consultando órdenes abiertas...');
                const openRes = await bitmartService.getOpenOrders(symbol);
                // CRÍTICO: El frontend espera un ARRAY directo. 
                // bitmartService.getOpenOrders devuelve { orders: [] }, extraemos el array:
                result = openRes.orders || [];
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
                    historyParams.order_state = status; 
                }
                
                // bitmartService.getHistoryOrders ya devuelve un array normalizado [...]
                result = await bitmartService.getHistoryOrders(historyParams);
                break;
                
            default:
                return res.status(400).json({ success: false, message: 'Invalid order status parameter' });
        }

        // LÓGICA DE RETORNO REFORZADA
        // 1. Aseguramos que 'ordersToReturn' sea siempre un Array.
        let ordersToReturn = [];
        if (Array.isArray(result)) {
            ordersToReturn = result;
        } else if (result && result.data && Array.isArray(result.data)) {
            ordersToReturn = result.data;
        } else if (result && result.orders && Array.isArray(result.orders)) {
            ordersToReturn = result.orders;
        }

        console.log(`[Backend]: Retornando ${ordersToReturn.length} órdenes para la pestaña ${status}.`);
        
        // 2. Enviamos el array directamente (como lo espera tu Dashboard antiguo)
        res.status(200).json(ordersToReturn);
        
    } catch (error) {
        console.error('Error al obtener órdenes:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};