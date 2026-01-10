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
                // Consultamos órdenes activas (las que están ejecutando la estrategia exponencial)
                const openData = await bitmartService.getOpenOrders(symbol);
                // Aseguramos que devolvemos un array plano para que el frontend lo mapee fácil
                result = openData.orders || [];
                break;

            case 'filled':
            case 'cancelled':
            case 'all':
                // Para el historial, configuramos los parámetros que bitmartService.getHistoryOrders espera
                const historyParams = {
                    symbol: symbol,
                    limit: 100,
                    // Pasamos el status directamente para que el service lo mapee con orderStatusMap
                    status: status 
                };
                
                // Obtenemos el historial normalizado
                const historyData = await bitmartService.getRecentOrders(symbol);
                
                // Si el status no es 'all', filtramos localmente para asegurar precisión 
                // (útil si el mapeo de la API tiene discrepancias)
                if (status !== 'all') {
                    result = historyData.filter(o => {
                        const s = (o.state || o.status || '').toString().toLowerCase();
                        if (status === 'filled') return s.includes('filled') || s === '1';
                        if (status === 'cancelled') return s.includes('cancel') || s === '6';
                        return true;
                    });
                } else {
                    result = historyData;
                }
                break;
                
            default:
                return res.status(400).json({ success: false, message: 'Parámetro de estado inválido' });
        }

        // Registro para depuración en la consola del servidor
        console.log(`[ORDER_CONTROLLER] ✅ Enviando ${result.length} órdenes al frontend.`);
        
        // Enviamos el array directamente
        res.status(200).json(result);
        
    } catch (error) {
        console.error('[ORDER_CONTROLLER] ❌ Error:', error.message);
        
        const errorMessage = error.response?.data?.message || error.message || 'Error interno del servidor';
        res.status(500).json({ success: false, message: errorMessage });
    }
};