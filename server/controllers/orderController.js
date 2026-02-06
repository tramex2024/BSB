const bitmartService = require('../services/bitmartService');

exports.getOrders = async (req, res) => {
    const { status } = req.params;
    
    if (!status) {
        return res.status(400).json({ success: false, message: 'Missing "status" parameter.' });
    }

    try {
        let result;
        const symbol = 'BTC_USDT';

        switch (status) {
            case 'opened':
                result = await bitmartService.getOpenOrders(symbol);
                // BitMart suele devolver { orders: [...] }, nos aseguramos de enviar solo el array
                return res.status(200).json(result.orders || result.data || result || []);

            case 'filled':
            case 'cancelled':
            case 'all':
                const endTime = Date.now();
                // 🎯 Ajuste: Aunque pedimos 90 días para cubrir el máximo, 
                // el "limit" es el que realmente corta la visibilidad.
                const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
                
                const historyParams = {
                    symbol: symbol,
                    orderMode: 'spot',
                    startTime: ninetyDaysAgo,
                    endTime: endTime,
                    // 🚀 SUBIMOS EL LÍMITE: BitMart permite hasta 200 en historial
                    // Si el bot hace 13 órdenes diarias, 200 órdenes = 15 días.
                    limit: 200 
                };
                
                if (status !== 'all') {
                    historyParams.order_state = status;
                }
                
                result = await bitmartService.getHistoryOrders(historyParams);
                break;
                
            default:
                return res.status(400).json({ success: false, message: 'Invalid order status' });
        }

        // BitMart v2/v3 suele envolver los resultados en 'data' o 'orders'
        const ordersToReturn = result.data || result.orders || result;
        
        // Si después de aumentar el límite a 200 sigues viendo pocos días,
        // significa que el bot es extremadamente activo (>13 órdenes/día).
        res.status(200).json(ordersToReturn);
        
    } catch (error) {
        console.error('Error al obtener órdenes:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};