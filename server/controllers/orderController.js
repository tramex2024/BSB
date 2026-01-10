// server/controllers/orderController.js

const bitmartService = require('../services/bitmartService');

/**
 * Obtiene las órdenes (Abiertas o Historial) desde BitMart
 */
exports.getOrders = async (req, res) => {
    const { status } = req.params;
    const symbol = 'BTC_USDT'; 

    console.log(`[ORDER_CONTROLLER] 📥 Petición recibida para estado: ${status}`);

    if (!status) {
        return res.status(400).json({ success: false, message: 'Falta el parámetro de estado.' });
    }

    try {
        let result;

        switch (status) {
            case 'opened':
                // ✅ RESTAURADO: Consultamos la API de BitMart para ver órdenes activas
                const openData = await bitmartService.getOpenOrders(symbol);
                // bitmartService.getOpenOrders devuelve { orders: [...] }
                result = openData.orders || [];
                break;

            case 'filled':
            case 'cancelled':
            case 'all':
                // Configuración de historial (90 días por defecto)
                const ninetyDaysAgo = new Date();
                ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
                
                const historyParams = {
                    symbol: symbol,
                    startTime: ninetyDaysAgo.getTime(),
                    endTime: Date.now(),
                    limit: 100
                };
                
                // Aplicamos el filtro de estado para el historial
                if (status !== 'all') {
                    historyParams.order_state = status; 
                }
                
                result = await bitmartService.getHistoryOrders(historyParams);
                break;
                
            default:
                return res.status(400).json({ success: false, message: 'Parámetro de estado inválido' });
        }

        // BitMart Service ya normaliza los resultados, así que los enviamos directamente
        res.status(200).json(result);
        
    } catch (error) {
        console.error('[ORDER_CONTROLLER] ❌ Error:', error.message);
        
        const errorMessage = error.response?.data?.message || error.message || 'Error interno del servidor';
        res.status(500).json({ success: false, message: errorMessage });
    }
};