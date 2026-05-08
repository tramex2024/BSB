/**
 * BSB PROFIT AUDIT SCRIPT - MAY 2026
 * PROPÓSITO: Sumar todos los netProfit de la DB para validar el acumulado.
 */

const mongoose = require('mongoose');

async function auditDatabaseProfits() {
    // Configuración de conexión
    const uri = 'mongodb+srv://tramex2024:vIHKxhFCqFOXC4tf@cluster0.y0qkdw4.mongodb.net/bsb?retryWrites=true&w=majority&appName=Cluster0';
    const TARGET_USER_ID = new mongoose.Types.ObjectId("69880862881f8789a039d0a3");

    try {
        console.log("🔗 Conectando a MongoDB para auditoría de cuentas...");
        await mongoose.connect(uri);
        
        // Accedemos a la colección de ciclos de trading
        const tradeCyclesCollection = mongoose.connection.collection('tradecycles');

        // Buscamos todos los ciclos del usuario
        const cycles = await tradeCyclesCollection.find({ userId: TARGET_USER_ID }).toArray();

        if (cycles.length === 0) {
            console.log("⚠️ No se encontraron ciclos para este usuario.");
            return;
        }

        console.log(`\n📊 AUDITORÍA DETALLADA (${cycles.length} ciclos encontrados)`);
        console.log(`------------------------------------------------------------`);
        console.log(`ID | Estrategia | Fecha | Net Profit (USDT)`);
        console.log(`------------------------------------------------------------`);

        let runningTotal = 0;

        cycles.forEach((cycle, index) => {
            const profit = parseFloat(cycle.netProfit || 0);
            runningTotal += profit;
            
            const date = cycle.endTime ? new Date(cycle.endTime).toISOString().split('T')[0] : 'N/A';
            const strategy = (cycle.strategy || 'N/A').padEnd(10);
            
            console.log(`${(index + 1).toString().padStart(2)} | ${strategy} | ${date} | ${profit.toFixed(8)}`);
        });

        console.log(`------------------------------------------------------------`);
        console.log(`💰 RESULTADO FINAL DE LA SUMA: ${runningTotal.toFixed(15)}`);
        console.log(`------------------------------------------------------------`);
        
        if (runningTotal.toFixed(2) === "23.23") {
            console.log("✅ RESULTADO: El valor coincide con el Dashboard (23.23).");
            console.log("🔍 CONCLUSIÓN: La DB solo contiene estos registros. No hay error de código.");
        } else {
            console.log("❌ RESULTADO: Hay una discrepancia entre la DB y el Dashboard.");
        }

    } catch (err) {
        console.error("❌ Error de ejecución:", err.message);
    } finally {
        await mongoose.disconnect();
        console.log("\n🔌 Desconectado de la base de datos.");
        process.exit();
    }
}

auditDatabaseProfits();