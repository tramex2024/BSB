/**
 * BSB/server/controllers/orderController.js
 * CONTROLADOR DE ÓRDENES EN BASE DE DATOS LOCAL
 */

const Order = require('../models/Order');

const getOrders = async (req, res) => {
    const { status } = req.params;
    const userId = req.user.id; // Extraído del middleware authenticateToken

    console.log(`[ORDER-CONTROLLER] 📊 Consultando DB local para usuario: ${userId}, estado: ${status}`);

    try {
        // REGLA DE ORO MULTIUSUARIO: Siempre filtrar por userId
        let filter = { userId: userId };

        // Normalizamos el status para que coincida con lo que guardamos en orderPersistenceService
        switch (status.toLowerCase()) {
            case 'opened':
                // Nota: Las órdenes realmente abiertas (en el exchange) se consultan vía bitmartService
                // Pero si guardamos órdenes pendientes en DB local, las buscamos aquí:
                filter.status = 'OPEN';
                break;
                
            case 'filled':
                // Coincidimos con el 'Filled' (con Mayúscula) que inyecta orderPersistenceService
                filter.status = 'Filled'; 
                break;
                
            case 'cancelled':
                filter.status = 'Canceled';
                break;
                
            case 'all':
                // No añadimos filtro de status, solo se mantiene el filtro de userId
                break;
                
            default:
                return res.status(400).json({ success: false, message: 'Estado inválido.' });
        }

        // Consulta optimizada y SEGURA
        const orders = await Order.find(filter)
            .sort({ orderTime: -1 }) 
            .limit(100)
            .lean(); // .lean() para mayor velocidad (objetos JS planos)

        console.log(`[ORDER-CONTROLLER] ✅ Enviando ${orders.length} órdenes para el usuario ${userId}.`);
        
        return res.status(200).json(orders);
        
    } catch (error) {
        console.error('❌ Error en orderController:', error.message);
        return res.status(500).json({ success: false, message: 'Error al recuperar el historial.' });
    }
};

module.exports = { getOrders };