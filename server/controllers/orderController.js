// server/controllers/orderController.js

const Order = require('../models/Order'); // Asegúrate de que esta ruta sea correcta para tu modelo Order

exports.getOrders = async (req, res) => {
    try {
        // Asumiendo que authMiddleware adjunta el ID del usuario en req.user.id
        const userId = req.user.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'User not authenticated.' });
        }

        // Obtener órdenes de la base de datos para el usuario logueado
        const orders = await Order.find({ userId: userId }).sort({ orderTime: -1 });

        res.status(200).json({
            success: true,
            message: 'Orders fetched successfully',
            orders: orders
        });
    } catch (error) {
        console.error('Error in orderController.getOrders:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error while fetching orders.',
            error: error.message
        });
    }
};