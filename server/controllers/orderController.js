/**
 * BSB/server/controllers/orderController.js
 * Corregido: Mapeo de estados y estrategias 2026
 * Adaptado para filtrado dinámico por estrategia específica
 */
const Order = require('../models/Order');

const getOrders = async (req, res) => {
    // Extraemos de params (ruta antigua) y de query (ruta nueva con ?strategy=)
    const { strategy: paramStrategy, status: paramStatus } = req.params; 
    const { strategy: queryStrategy } = req.query;
    const userId = req.user.id; 

    try {
        let filter = { userId: userId };

        // --- PASO 1: Determinar Estrategia (Lógica Nueva + Soporte Legado) ---
        
        // Si viene de la nueva ruta: /api/orders/autobot/filter?strategy=long
        if (queryStrategy) {
            const strat = queryStrategy.toLowerCase();
            if (strat === 'all') {
                filter.strategy = { $in: ['long', 'short', 'ex'] };
            } else if (strat === 'ex') {
                filter.strategy = 'ex';
                // Para la pestaña "Open" (ex), solemos querer solo las abiertas por defecto
                filter.status = { $in: ['NEW', 'PARTIALLY_FILLED', 'PENDING', 'OPEN', 'ACTIVE'] };
            } else {
                filter.strategy = strat; // 'long' o 'short'
            }
        } 
        // Si viene de la ruta antigua: /api/orders/:strategy/:status
        else if (paramStrategy) {
            const tab = paramStrategy.toLowerCase();
            if (tab === 'autobot') {
                filter.strategy = { $in: ['long', 'short', 'ex'] };
            } else if (tab === 'aibot') {
                filter.strategy = { $in: ['ai', 'aibot'] }; 
            } else {
                filter.strategy = tab;
            }

            // --- PASO 2: Filtrar por Estado (Solo para ruta antigua) ---
            if (paramStatus) {
                switch (paramStatus.toLowerCase()) {
                    case 'opened':
                        filter.status = { $in: ['NEW', 'PARTIALLY_FILLED', 'PENDING', 'OPEN', 'ACTIVE'] }; 
                        break;
                    case 'filled':
                        filter.status = 'FILLED'; 
                        break;
                    case 'cancelled':
                        filter.status = { $in: ['CANCELED', 'CANCELLED'] }; 
                        break;
                    case 'all':
                        // Sin filtro de estado adicional
                        break;
                    default:
                        // Si no es un estado reconocido, no bloqueamos, pero lo registramos
                        console.warn(`[ORDER-CONTROLLER] Estado inusual recibido: ${paramStatus}`);
                }
            }
        }

        // Ejecución de la consulta en MongoDB
        const orders = await Order.find(filter)
            .sort({ orderTime: -1 }) 
            .limit(100)
            .lean();

        // Log de depuración para Render
        const logContext = queryStrategy ? `QueryStrategy: ${queryStrategy}` : `${paramStrategy}/${paramStatus}`;
        console.log(`[ORDER-CONTROLLER] ✅ Enviando ${orders.length} órdenes para [${logContext}] - User: ${userId}`);

        return res.status(200).json(orders);
        
    } catch (error) {
        console.error('❌ Error en orderController:', error.message);
        return res.status(500).json({ success: false, message: 'Error al recuperar órdenes.' });
    }
};

module.exports = { getOrders };