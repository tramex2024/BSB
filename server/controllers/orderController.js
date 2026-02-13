/**
 * BSB/server/controllers/orderController.js
 * Corregido: Mapeo de estados y estrategias 2026
 */
const Order = require('../models/Order');

const getOrders = async (req, res) => {
    const { strategy, status } = req.params; 
    const userId = req.user.id; 

    try {
        let filter = { userId: userId };

        // --- PASO 1: Filtrar por Estrategia ---
        const tab = strategy.toLowerCase();
        if (tab === 'autobot') {
            filter.strategy = { $in: ['long', 'short', 'ex'] };
        } else if (tab === 'aibot') {
            // Buscamos tanto 'ai' como 'aibot' por si acaso hay mezcla en la DB
            filter.strategy = { $in: ['ai', 'aibot'] }; 
        } else {
            filter.strategy = tab;
        }

        // --- PASO 2: Filtrar por Estado (CORREGIDO) ---
        switch (status.toLowerCase()) {
            case 'opened':
                // Las órdenes abiertas en BitMart pueden ser NEW o PARTIALLY_FILLED
                filter.status = { $in: ['NEW', 'PARTIALLY_FILLED', 'PENDING', 'OPEN', 'ACTIVE'] }; 
                break;
            case 'filled':
                filter.status = 'FILLED'; 
                break;
            case 'cancelled':
                filter.status = { $in: ['CANCELED', 'CANCELLED'] }; 
                break;
            case 'all':
                // Sin filtro de estado
                break;
            default:
                return res.status(400).json({ success: false, message: 'Estado inválido.' });
        }

        const orders = await Order.find(filter)
            .sort({ orderTime: -1 }) 
            .limit(100)
            .lean();

        // Log de depuración para que veas qué está pasando en Render
        console.log(`[ORDER-CONTROLLER] ✅ Enviando ${orders.length} órdenes para ${strategy}/${status}`);

        return res.status(200).json(orders);
        
    } catch (error) {
        console.error('❌ Error en orderController:', error.message);
        return res.status(500).json({ success: false, message: 'Error al recuperar órdenes.' });
    }
};

module.exports = { getOrders };