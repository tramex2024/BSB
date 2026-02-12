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

        // Sincronizamos con la lógica de BitMart y tus pestañas del Front
        switch (status.toLowerCase()) {
            case 'opened':
                /**
                 * Solo mostramos órdenes que están esperando ser tomadas por el mercado.
                 * El sync del orchestrator mapea 'NEW' y 'PENDING' de BitMart a 'PENDING'.
                 */
                filter.status = 'PENDING'; 
                break;
                
            case 'filled':
                /**
                 * Aquí incluimos las completadas y las que ya empezaron a llenarse.
                 * Como operas a mercado, estas pasan por aquí casi de inmediato.
                 */
                filter.status = { $in: ['FILLED'] }; 
                break;
                
            case 'cancelled':
                filter.status = 'CANCELED'; 
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

        console.log(`[ORDER-CONTROLLER] ✅ Enviando ${orders.length} órdenes.`);
        
        return res.status(200).json(orders);
        
    } catch (error) {
        console.error('❌ Error en orderController:', error.message);
        return res.status(500).json({ success: false, message: 'Error al recuperar el historial.' });
    }
};

module.exports = { getOrders };