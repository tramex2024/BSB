const mongoose = require('mongoose');

async function runPurgeAndInit() {
    try {
        const uri = 'mongodb+srv://tramex2024:vIHKxhFCqFOXC4tf@cluster0.y0qkdw4.mongodb.net/bsb?retryWrites=true&w=majority&appName=Cluster0';
        
        console.log("🔗 Conectando directamente a MongoDB...");
        await mongoose.connect(uri);
        console.log("✅ Conexión establecida.");

        // Accedemos a la colección 'autobots' directamente
        const collection = mongoose.connection.collection('autobots');

        // Tu ID específico detectado en el JSON anterior
        const filter = { _id: new mongoose.Types.ObjectId("690fd622ced7eb324d1ffa2f") };
        
        const update = {
            // 1. ELIMINAMOS los campos duplicados/viejos
            $unset: { 
                lsprice: "", 
                sbprice: "" 
            },
            // 2. INICIALIZAMOS los campos de Trailing en 0
            $set: {
                lpm: 0,
                lpc: 0,
                spm: 0,
                spc: 0
            }
        };

        console.log("🧹 Limpiando redundancias e inicializando campos de Trailing...");
        const result = await collection.updateOne(filter, update);

        if (result.matchedCount > 0) {
            console.log(`✨ ¡Proceso completado!`);
            console.log(`- Documentos encontrados: ${result.matchedCount}`);
            console.log(`- Documentos modificados: ${result.modifiedCount}`);
            console.log("\nCampos eliminados: lsprice, sbprice");
            console.log("Campos creados: lpm, lpc, spm, spc (seteados en 0)");
        } else {
            console.log("⚠️ No se encontró el documento con el ID: 690fd622ced7eb324d1ffa2f");
        }

    } catch (err) {
        console.error("❌ Error crítico:", err.message);
    } finally {
        await mongoose.disconnect();
        console.log("🔌 Desconectado.");
        process.exit();
    }
}

runPurgeAndInit();