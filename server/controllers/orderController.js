// BSB/server/controllers/orderController.js

const bitmartService = require('../services/bitmartService');

exports.getOrders = async (req, res) => {
    const { status } = req.params;

    // Forzamos JSON para evitar que errores del servidor devuelvan HTML (causante del 404/Unexpected Token)
    res.setHeader('Content-Type', 'application/json');

    console.log(`[Backend]: Solicitando órdenes - Tipo: ${status}`);

    if (!status) {
        return res.status(400).json({ success: false, message: 'Falta el parámetro status.' });
    }

    try {
        let result;
        const symbol = 'BTC_USDT';

        switch (status) {
            case 'opened':
                // Las órdenes abiertas se manejan por WebSocket en el frontend
                return res.status(200).json([]);
                
            case 'filled':
            case 'cancelled':
            case 'all':
                const ninetyDaysAgo = new Date();
                ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
                
                const historyParams = {
                    symbol: symbol,
                    orderMode: 'spot',
                    startTime: ninetyDaysAgo.getTime(),
                    endTime: Date.now(),
                    limit: 100,
                    // Enviamos 'status' para que bitmartService haga el mapeo numérico (1 o 6)
                    status: status 
                };
                
                result = await bitmartService.getHistoryOrders(historyParams);
                break;
                
            default:
                return res.status(400).json({ success: false, message: 'Estado de orden no válido.' });
        }

        // El servicio ya devuelve el array mapeado. Validamos que sea un array.
        const ordersToReturn = Array.isArray(result) ? result : [];

        return res.status(200).json(ordersToReturn);
        
    } catch (error) {
        console.error('❌ Error en orderController:', error.message);
        
        let errorMessage = 'Error al obtener datos de BitMart.';
        if (error.response?.data?.message) errorMessage = error.response.data.message;
        
        // Enviamos un array vacío en lugar de un error de objeto para no romper el .map() del frontend
        return res.status(500).json([]); 
    }
};