// BSB/server/controllers/orderController.js

const bitmartService = require('../services/bitmartService');

exports.getOrders = async (req, res) => {
    // OBTENEMOS EL TIPO DE ORDEN DE LOS PARÁMETROS DE RUTA (Lógica funcional antigua)
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
                // RESTAURADO: Aunque se use WS, mantenemos la lógica de la versión funcional 
                // para que la API responda si el frontend lo solicita.
                console.log('[Backend]: Consultando órdenes abiertas...');
                result = await bitmartService.getOpenOrders(symbol);
                break;
                
            case 'filled':
            case 'cancelled':
            case 'all':
                // LÓGICA ANTIGUA FUNCIONAL: Rango de 90 días y parámetros correctos
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
                
                // CORRECCIÓN CRÍTICA RECUPERADA: 
                // Usamos 'order_state' como hacía la versión funcional
                if (status !== 'all') {
                    historyParams.order_state = status; 
                }
                
                result = await bitmartService.getHistoryOrders(historyParams);
                break;
                
            default:
                return res.status(400).json({ success: false, message: 'Invalid order status parameter' });
        }

        // EXTRACCIÓN DE DATOS (Lógica funcional antigua)
        // Se asegura de extraer .data si existe, o devolver el result directamente
        const ordersToReturn = result && result.data ? result.data : result;

        console.log(`[Backend]: Retornando ${Array.isArray(ordersToReturn) ? ordersToReturn.length : 0} órdenes.`);
        res.status(200).json(ordersToReturn);
        
    } catch (error) {
        console.error('Error al obtener órdenes. Detalles:', error.response ? error.response.data : error.message);
        
        let errorMessage = 'Error al obtener órdenes. Por favor, revisa tus API Keys.';
        if (error.response?.data?.message) {
            errorMessage = error.response.data.message;
        } else if (error.message) {
            errorMessage = error.message;
        }
        
        res.status(500).json({ success: false, message: errorMessage });
    }
};