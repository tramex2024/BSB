// BSB/server/controllers/orderController.js

const Order = require('../models/Order');

const getOrders = async (req, res) => {
    const { status } = req.params;

    console.log(`[ORDER-CONTROLLER] 📊 Consultando DB local para: ${status}`);

    try {
        let filter = {};

        // Ajustamos los casos para que coincidan con los ENUMS de tu modelo Order.js
        switch (status) {
            case 'opened':
                // Las órdenes abiertas se manejan vía WebSockets
                return res.status(200).json([]);
                
            case 'filled':
                // Tu modelo usa 'FILLED' en mayúsculas por defecto
                filter.status = 'FILLED'; 
                break;
                
            case 'cancelled':
                // Asumiendo que guardas las canceladas como 'CANCELED'
                filter.status = 'CANCELED';
                break;
                
            case 'all':
                // Sin filtro, trae todo
                break;
                
            default:
                return res.status(400).json({ success: false, message: 'Estado inválido.' });
        }

        // Consulta optimizada con los índices de tu modelo (strategy y orderTime)
        const orders = await Order.find(filter)
            .sort({ orderTime: -1 }) 
            .limit(100)
            .lean();

        console.log(`[ORDER-CONTROLLER] ✅ Enviando ${orders.length} órdenes encontradas.`);
        
        return res.status(200).json(orders);
        
    } catch (error) {
        console.error('❌ Error en orderController:', error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = { getOrders };