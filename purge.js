const mongoose = require('mongoose');

async function runPurge() {
    try {
        const uri = 'mongodb+srv://tramex2024:vIHKxhFCqFOXC4tf@cluster0.y0qkdw4.mongodb.net/bsb?retryWrites=true&w=majority&appName=Cluster0';
        
        console.log("🔗 Conectando directamente a MongoDB...");
        await mongoose.connect(uri);
        console.log("✅ Conexión establecida.");

        // Accedemos a la colección 'autobots' directamente (sin usar el Modelo de archivo)
        const collection = mongoose.connection.collection('autobots');

        const filter = { _id: new mongoose.Types.ObjectId("690fd622ced7eb324d1ffa2f") };
        
        const update = {
            $unset: { 
                lStateData: "", 
                sStateData: "", 
                lreqAmount: "", 
                sreqAmount: "",
                lpc: "", 
                lpm: "", 
                spc: "", 
                spm: ""
            }
        };

        console.log("🧹 Ejecutando purga en el documento especificado...");
        const result = await collection.updateOne(filter, update);

        if (result.modifiedCount > 0) {
            console.log("✨ ¡Limpieza total completada con éxito!");
        } else {
            console.log("⚠️ No se realizaron cambios (tal vez los campos ya no existían o el ID es incorrecto).");
        }

    } catch (err) {
        console.error("❌ Error crítico:", err.message);
    } finally {
        await mongoose.disconnect();
        console.log("🔌 Desconectado.");
        process.exit();
    }
}

runPurge();