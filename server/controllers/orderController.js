// BSB/server/controllers/orderController.js


const bitmartService = require('../services/bitmartService');

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
                return res.status(200).json([]); 
                
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
                    limit: 100,
                    // Enviamos el status para que el servicio haga el mapeo numérico (1, 6)
                    status: status 
                };
                
                result = await bitmartService.getHistoryOrders(historyParams);
                break;
                
            default:
                return res.status(400).json({ success: false, message: 'Invalid order status parameter' });
        }

        // Normalización de la respuesta:
        // El servicio ya devuelve el array mapeado. Nos aseguramos de enviar solo el array al frontend.
        const ordersToReturn = Array.isArray(result) ? result : (result && result.data ? result.data : []);

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