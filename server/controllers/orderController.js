// BSB/server/controllers/orderController.js

const bitmartService = require('../services/bitmartService');

exports.getOrders = async (req, res) => {
    const { status } = req.params;
    const symbol = 'BTC_USDT';

    console.log(`[ORDERS] Petición recibida para tipo: ${status}`);

    try {
        let ordersToReturn = [];

        switch (status) {
            case 'opened':
                // REST como respaldo: Si el WebSocket aún no ha conectado, 
                // el frontend pide aquí las órdenes actuales.
                const openData = await bitmartService.getOpenOrders(symbol);
                ordersToReturn = openData.orders || []; 
                break;

            case 'filled':
            case 'cancelled':
            case 'all':
                const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
                
                const historyParams = {
                    symbol: symbol,
                    startTime: ninetyDaysAgo,
                    endTime: Date.now(),
                    limit: 100 
                };
                
                // Mapeamos el status del frontend al formato que espera BitMart
                if (status !== 'all') {
                    historyParams.order_state = status; 
                }
                
                const historyData = await bitmartService.getHistoryOrders(historyParams);
                // getHistoryOrders ya devuelve el array mapeado en nuestro service unificado
                ordersToReturn = historyData;
                break;
                
            default:
                return res.status(400).json({ success: false, message: 'Parámetro de estado inválido' });
        }

        // Enviamos siempre un Array, incluso si está vacío
        return res.status(200).json(ordersToReturn);
        
    } catch (error) {
        console.error('❌ Error en getOrders:', error.message);
        return res.status(500).json({ 
            success: false, 
            message: error.message || 'Error interno al obtener órdenes' 
        });
    }
};