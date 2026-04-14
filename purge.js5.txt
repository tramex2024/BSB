const mongoose = require('mongoose');

async function migrateCycles() {
    // Tu URI de conexión
    const uri = 'mongodb+srv://tramex2024:vIHKxhFCqFOXC4tf@cluster0.y0qkdw4.mongodb.net/bsb?retryWrites=true&w=majority&appName=Cluster0';
    
    // DATOS DE IDENTIDAD (Auditados)
    const TARGET_USER_ID = new mongoose.Types.ObjectId("69880862881f8789a039d0a3");
    const TARGET_BOT_ID = new mongoose.Types.ObjectId("690fd622ced7eb324d1ffa2f");

    try {
        console.log("🔗 Conectando a MongoDB para migración de ciclos...");
        await mongoose.connect(uri);
        const cyclesCollection = mongoose.connection.collection('tradecycles');

        // 1. Auditamos cuántos ciclos hay sin dueño para este bot
        const count = await cyclesCollection.countDocuments({ 
            autobotId: TARGET_BOT_ID,
            userId: { $exists: false } 
        });

        if (count === 0) {
            console.log("⚠️ No se encontraron ciclos huérfanos para este bot. Tal vez ya fueron actualizados.");
        } else {
            console.log(`🔎 Encontrados ${count} ciclos para reparar.`);

            // 2. Ejecutamos la migración
            // $set: añade el userId
            // También podemos aprovechar para asegurar que el status sea COMPLETED
            const result = await cyclesCollection.updateMany(
                { 
                    autobotId: TARGET_BOT_ID,
                    userId: { $exists: false } 
                },
                { 
                    $set: { 
                        userId: TARGET_USER_ID,
                        status: 'COMPLETED'
                    } 
                }
            );

            console.log(`---------------------------------`);
            console.log(`✅ MIGRACIÓN EXITOSA`);
            console.log(`- Documentos modificados: ${result.modifiedCount}`);
            console.log(`- Vinculados al User: ${TARGET_USER_ID}`);
            console.log(`---------------------------------`);
        }

    } catch (err) {
        console.error("❌ Error en la migración:", err.message);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
}

migrateCycles();