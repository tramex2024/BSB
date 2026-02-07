// BSB/server/controllers/orderController.js

const Order = require('../models/Order'); // Asegúrate de que la ruta al modelo sea correcta

/**
 * CONTROLADOR DE ÓRDENES (Historial Local)
 * Este controlador ya no consulta a BitMart. Usa MongoDB como fuente de verdad.
 */
const getOrders = async (req, res) => {
    // 1. Obtenemos el tipo de orden de los parámetros de ruta (ej: /api/orders/filled)
    const { status } = req.params;

    console.log(`[ORDER-CONTROLLER] 📊 Petición de historial: ${status}`);

    if (!status) {
        return res.status(400).json({ 
            success: false, 
            message: 'Falta el parámetro de estado (status) en la URL.' 
        });
    }

    try {
        let filter = {};

        // --- 2. LÓGICA DE FILTRADO PARA MONGODB ---
        switch (status) {
            case 'opened':
                /**
                 * IMPORTANTE: Las órdenes abiertas ahora se manejan por WebSockets
                 * para evitar el polling constante al servidor. Devolvemos un array 
                 * vacío para que el dashboard no de error al cargar la pestaña.
                 */
                return res.status(200).json([]);
                
            case 'filled':
                // Filtramos por órdenes ejecutadas (Take Profit, DCA, Apertura)
                filter.status = 'Filled';
                break;
                
            case 'cancelled':
                // Filtramos por órdenes canceladas o fallidas
                filter.status = 'Canceled';
                break;
                
            case 'all':
                // Sin filtro, trae todo el historial guardado por el bot
                break;
                
            default:
                return res.status(400).json({ 
                    success: false, 
                    message: 'Estado de orden no válido. Use: opened, filled, cancelled o all.' 
                });
        }

        // --- 3. CONSULTA A LA BASE DE DATOS ---
        // Buscamos las órdenes que el orderPersistenceService ha guardado
        const ordersToReturn = await Order.find(filter)
            .sort({ orderTime: -1 }) // Mostrar las más recientes primero
            .limit(100)              // Límite de seguridad para el frontend
            .lean();

        console.log(`[ORDER-CONTROLLER] ✅ Enviando ${ordersToReturn.length} órdenes desde la DB.`);
        
        // --- 4. RESPUESTA AL FRONTEND ---
        // Enviamos el array directamente para que el Dashboard lo mapee sin cambios
        return res.status(200).json(ordersToReturn);
        
    } catch (error) {
        console.error('❌ Error crítico en orderController:', error.message);
        return res.status(500).json({ 
            success: false, 
            message: 'Error interno al consultar la base de datos local.' 
        });
    }
};

// Exportamos como un objeto para que el Router lo desestructure correctamente
module.exports = {
    getOrders
};