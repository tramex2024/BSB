// server/routes/ordersRoutes.js

const Order = require('../models/Order'); // Importamos tu modelo de persistencia local

exports.getOrders = async (req, res) => {
    const { status } = req.params;

    // En un entorno multiusuario, aquí filtraríamos por req.user.id
    console.log(`[Backend]: Consultando historial local para: ${status}`);

    if (!status) {
        return res.status(400).json({ success: false, message: 'Falta el parámetro de estado.' });
    }

    try {
        let ordersToReturn = [];

        if (status === 'opened') {
            // ✅ Las órdenes abiertas se manejan por WebSockets/Redux en el frontend,
            // pero si el frontend pide el estado inicial, devolvemos vacío o el llastOrder.
            return res.status(200).json([]);
        }

        // --- CONSULTA A MONGODB ---
        // Construimos el filtro
        let filter = {};
        
        if (status === 'filled') {
            filter.status = 'Filled';
        } else if (status === 'cancelled') {
            filter.status = 'Canceled';
        }
        // Si status es 'all', el filtro se queda vacío para traer todo.

        // Buscamos en nuestra base de datos local
        ordersToReturn = await Order.find(filter)
            .sort({ orderTime: -1 }) // Las más recientes primero
            .limit(100)
            .lean();

        console.log(`[Backend]: Retornando ${ordersToReturn.length} órdenes desde MongoDB (Filtro: ${status}).`);
        
        res.status(200).json(ordersToReturn);
        
    } catch (error) {
        console.error('❌ Error en OrderController:', error.message);
        res.status(500).json({ 
            success: false, 
            message: 'Error al recuperar el historial desde la base de datos local.' 
        });
    }
};