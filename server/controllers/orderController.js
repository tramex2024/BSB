/**
 * BSB/server/controllers/orderController.js
 */
const Order = require('../models/Order');

const getOrders = async (req, res) => {
    const { status } = req.params;
    const userId = req.user.id; 

    console.log(`[ORDER-CONTROLLER] 📊 Consultando DB para usuario: ${userId}, estado: ${status}`);

    try {
        let filter = { userId: userId };

        // Sincronizamos con los Enums del Modelo Order.js (Todo en MAYÚSCULAS)
        switch (status.toLowerCase()) {
            case 'opened':
                filter.status = 'OPEN'; // O 'PENDING' según tu lógica de BitMart
                break;
                
            case 'filled':
                filter.status = 'FILLED'; // <--- CORREGIDO: Antes decía 'Filled'
                break;
                
            case 'cancelled':
                filter.status = 'CANCELED'; // <--- CORREGIDO: Antes decía 'Canceled'
                break;
                
            case 'all':
                break;
                
            default:
                return res.status(400).json({ success: false, message: 'Estado inválido.' });
        }

        const orders = await Order.find(filter)
            .sort({ orderTime: -1 }) 
            .limit(100)
            .lean();

        console.log(`[ORDER-CONTROLLER] ✅ Enviando ${orders.length} órdenes.`);
        
        // Retornamos el array directamente para que el frontend lo mapee
        return res.status(200).json(orders);
        
    } catch (error) {
        console.error('❌ Error en orderController:', error.message);
        return res.status(500).json({ success: false, message: 'Error al recuperar el historial.' });
    }
};

module.exports = { getOrders };