// server/controllers/orderController.js

const bitmartService = require('../services/bitmartService');

exports.getOrders = async (req, res) => {
    const { status } = req.params;
    const symbol = 'BTC_USDT'; 

    try {
        let result;
        switch (status) {
            case 'opened':
                // Aquí estaba el detalle: bitmartService devuelve { orders: [...] }
                const openData = await bitmartService.getOpenOrders(symbol);
                result = openData.orders || []; 
                break;

            case 'filled':
            case 'cancelled':
            case 'all':
                const ninetyDaysAgo = new Date();
                ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
                
                const historyParams = {
                    symbol: symbol,
                    startTime: ninetyDaysAgo.getTime(),
                    endTime: Date.now(),
                    limit: 100
                };
                
                if (status !== 'all') {
                    historyParams.order_state = status; 
                }
                
                result = await bitmartService.getHistoryOrders(historyParams);
                break;
                
            default:
                return res.status(400).json({ success: false, message: 'Estado inválido' });
        }

        // Importante: Enviar el resultado directamente como array
        res.status(200).json(result);
        
    } catch (error) {
        console.error('[ORDER_CONTROLLER] Error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};