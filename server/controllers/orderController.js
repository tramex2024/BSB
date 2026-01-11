// server/controllers/orderController.js

// server/controllers/orderController.js

exports.getOrders = async (req, res) => {
    const { status } = req.params;
    const symbol = 'BTC_USDT'; 

    try {
        let result;
        switch (status) {
            case 'opened':
                // ✅ RESTAURADO: Obtener órdenes reales para la carga inicial
                console.log(`[Backend]: Consultando órdenes abiertas en BitMart para ${symbol}`);
                result = await bitmartService.getOpenOrders(symbol);
                
                // LOG DE DEBUG (Lo que pediste)
                console.log("--------------------------------------------");
                console.log("🔍 DEBUG ÓRDENES ABIERTAS RECIBIDAS:");
                console.dir(result, { depth: null });
                console.log("--------------------------------------------");
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
                
                result = await bitmartService.getHistoryOrders(historyParams);
                break;
                
            default:
                return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        // Normalizamos la respuesta: BitMart a veces envuelve en .data o .orders
        const ordersToReturn = result.orders ? result.orders : (result.data ? result.data : result);
        res.status(200).json(ordersToReturn);
        
    } catch (error) {
        console.error('Error en getOrders:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};