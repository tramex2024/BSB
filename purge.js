const mongoose = require('mongoose');

async function migrateOrdersOnly() {
    try {
        const uri = 'mongodb+srv://tramex2024:vIHKxhFCqFOXC4tf@cluster0.y0qkdw4.mongodb.net/bsb?retryWrites=true&w=majority&appName=Cluster0';
        
        // ID del usuario que debe ser dueño de estas órdenes
        const TARGET_USER_ID = new mongoose.Types.ObjectId("69880862881f8789a039d0a3");

        console.log("🔗 Conectando a MongoDB para migración de órdenes...");
        await mongoose.connect(uri);

        const ordersCollection = mongoose.connection.collection('orders');

        // 1. OBTENER TODAS LAS ÓRDENES
        const allOrders = await ordersCollection.find({}).toArray();
        console.log(`📦 Encontradas ${allOrders.length} órdenes para procesar.`);

        let updatedCount = 0;

        for (const order of allOrders) {
            // Preparamos los datos normalizados
            const normalizedData = {
                userId: TARGET_USER_ID,
                status: (order.status || 'FILLED').toUpperCase(),
                side: (order.side || 'BUY').toUpperCase(),
                type: (order.type || 'MARKET').toUpperCase(),
                strategy: (order.strategy || 'long').toLowerCase(),
                // Si no tiene cycleIndex, le ponemos 0 por defecto
                cycleIndex: order.cycleIndex !== undefined ? order.cycleIndex : 0
            };

            await ordersCollection.updateOne(
                { _id: order._id },
                { $set: normalizedData }
            );
            updatedCount++;
        }

        console.log(`\n✅ MIGRACIÓN COMPLETADA`);
        console.log(`---------------------------------`);
        console.log(`- Órdenes procesadas: ${updatedCount}`);
        console.log(`- Vinculadas al Usuario: ${TARGET_USER_ID}`);
        console.log(`- Status normalizados: (Ej: 'Filled' -> 'FILLED')`);
        console.log(`---------------------------------`);
        console.log(`🚀 Ahora el frontend debería mostrar todo correctamente.`);

    } catch (err) {
        console.error("❌ Error durante la migración:", err.message);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
}

migrateOrdersOnly();