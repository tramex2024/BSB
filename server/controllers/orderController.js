/**
 * BSB/server/controllers/orderController.js
 */
const Order = require('../models/Order');

const getOrders = async (req, res) => {
    // Ahora extraemos ambos parámetros de la URL
    const { strategy, status } = req.params; 
    const userId = req.user.id; 

    console.log(`[ORDER-CONTROLLER] 📊 Consulta: User ${userId} | Tab: ${strategy} | Status: ${status}`);

    try {
        let filter = { userId: userId };

        // --- PASO 1: Filtrar por Pestaña (Estrategias) ---
        const tab = strategy.toLowerCase();
        if (tab === 'autobot') {
            // En AUTOBOT vemos los bots manuales/ciclos y las órdenes externas
            filter.strategy = { $in: ['long', 'short', 'ex'] };
        } else if (tab === 'aibot') {
            // En AIBOT solo lo que pertenece a la IA
            filter.strategy = 'ai';
        } else {
            // Por seguridad, si mandan algo raro, filtramos por la palabra exacta
            filter.strategy = tab;
        }

        // --- PASO 2: Filtrar por Estado ---
        switch (status.toLowerCase()) {
            case 'opened':
                filter.status = 'PENDING'; 
                break;
            case 'filled':
                filter.status = 'FILLED'; 
                break;
            case 'cancelled':
                filter.status = 'CANCELED'; 
                break;
            case 'all':
                // Sin filtro de estado para ver todo lo de esa pestaña
                break;
            default:
                return res.status(400).json({ success: false, message: 'Estado inválido.' });
        }

        const orders = await Order.find(filter)
            .sort({ orderTime: -1 }) 
            .limit(100)
                .lean();

        return res.status(200).json(orders);
        
    } catch (error) {
        console.error('❌ Error en orderController:', error.message);
        return res.status(500).json({ success: false, message: 'Error al recuperar órdenes.' });
    }
};

module.exports = { getOrders };