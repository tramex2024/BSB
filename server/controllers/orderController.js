// BSB/server/controllers/orderController.js

/**
 * orderController.js - Versión Unificada Corregida
 * Recupera órdenes reales de MongoDB para las pestañas Filled, Cancelled y All
 */
const Order = require('../models/Order');

const orderController = {
    getOrders: async (req, res) => {
        try {
            const { type } = req.params; 
            let query = {};
            
            // FILTRADO ESTRICTO SEGÚN LA PESTAÑA
            if (type === 'filled') {
                query = { status: 'filled' };
            } else if (type === 'cancelled') {
                // Capturamos todas las variantes de cancelación
                query = { status: { $in: ['canceled', 'cancelled', 'rejected'] } };
            } else if (type === 'opened') {
                query = { status: 'new' };
            }
            // Si es 'all', el query se mantiene vacío {} y trae todo el historial

            const orders = await Order.find(query).sort({ orderTime: -1 });

            return res.status(200).json({
                success: true,
                data: orders
            });
        } catch (error) {
            console.error('❌ Error filtrando órdenes:', error);
            res.status(500).json({ success: false, data: [] });
        }
    }
};

module.exports = orderController;