/**
 * BSB DURATION CORRECTION SCRIPT - MAY 2026
 * PROPÓSITO: Recalcular durationHours basado en startTime y endTime.
 */

const mongoose = require('mongoose');

async function fixTradeCyclesDuration() {
    // Configuración de conexión (usando tu URI proporcionada)
    const uri = 'mongodb+srv://tramex2024:vIHKxhFCqFOXC4tf@cluster0.y0qkdw4.mongodb.net/bsb?retryWrites=true&w=majority&appName=Cluster0';
    const TARGET_USER_ID = new mongoose.Types.ObjectId("69880862881f8789a039d0a3");

    try {
        console.log("🔗 Conectando a MongoDB para corregir duraciones...");
        await mongoose.connect(uri);
        
        // Accedemos a la colección directamente
        const tradeCyclesCollection = mongoose.connection.collection('tradecycles');

        // Buscamos ciclos que tengan ambos campos de tiempo
        const query = { 
            userId: TARGET_USER_ID,
            startTime: { $exists: true },
            endTime: { $exists: true }
        };

        const cycles = await tradeCyclesCollection.find(query).toArray();

        if (cycles.length === 0) {
            console.log("⚠️ No se encontraron ciclos válidos para corregir.");
            return;
        }

        console.log(`\n🛠️ INICIANDO CORRECCIÓN (${cycles.length} ciclos detectados)`);
        console.log(`------------------------------------------------------------`);

        let updatedCount = 0;

        for (const cycle of cycles) {
            const start = new Date(cycle.startTime);
            const end = new Date(cycle.endTime);

            // Cálculo: (Diferencia en ms) / (ms en una hora)
            const durationMs = end - start;
            const durationHours = durationMs / (1000 * 60 * 60);

            // Solo actualizamos si el cálculo es un número válido
            if (!isNaN(durationHours)) {
                await tradeCyclesCollection.updateOne(
                    { _id: cycle._id },
                    { $set: { durationHours: durationHours } }
                );
                
                console.log(`✅ ID: ${cycle._id} | Nueva Duración: ${durationHours.toFixed(4)} hrs`);
                updatedCount++;
            } else {
                console.log(`❌ ID: ${cycle._id} | Error: Fechas inválidas.`);
            }
        }

        console.log(`------------------------------------------------------------`);
        console.log(`📊 RESUMEN: Se actualizaron ${updatedCount} registros correctamente.`);
        console.log(`------------------------------------------------------------`);

    } catch (err) {
        console.error("❌ Error de ejecución:", err.message);
    } finally {
        await mongoose.disconnect();
        console.log("\n🔌 Desconectado de la base de datos.");
        process.exit();
    }
}

fixTradeCyclesDuration();