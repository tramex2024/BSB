// BSB/server/controllers/orderController.js

/**
 * orderController.js - Versión Unificada Corregida
 * Recupera órdenes reales de MongoDB para las pestañas Filled, Cancelled y All
 */
const Order = require('../models/Order');

const orderController = {
    // Retorna órdenes según su estado
    getOrders: async (req, res) => {
        try {
            const { type } = req.params; // 'all', 'filled', 'cancelled'
            console.log(`[ORDERS-API] 🔍 Petición recibida para tipo: ${type}`);

            let query = {};
            
            // Filtros basados en el estado almacenado en MongoDB
            if (type === 'filled') {
                query = { status: 'filled' };
            } else if (type === 'cancelled') {
                query = { status: { $in: ['canceled', 'cancelled', 'rejected'] } };
            }
            // Si es 'all', el query se queda vacío {} para traer todo

            const orders = await Order.find(query)
                .sort({ orderTime: -1 }) // Las más recientes primero
                .limit(50);

            console.log(`[ORDERS-API] ✅ Enviando ${orders.length} órdenes al frontend.`);
            
            return res.status(200).json({
                success: true,
                count: orders.length,
                data: orders
            });
        } catch (error) {
            console.error('❌ Error en getOrders:', error);
            res.status(500).json({ success: false, message: 'Error interno del servidor' });
        }
    },

    // Esta ruta se mantiene por compatibilidad, pero ahora busca en DB
    getOpenedOrders: async (req, res) => {
        try {
            // Intentamos traer lo que la DB cree que está abierto
            const openOrders = await Order.find({ status: 'new' }).sort({ orderTime: -1 });
            res.status(200).json(openOrders);
        } catch (error) {
            res.status(500).json([]);
        }
    }
};

module.exports = orderController;