/**
 * BSB DATABASE AUDIT SCRIPT - MAY 2026
 * PURPOSE: Query and verify Net Profit for all completed cycles.
 */

const mongoose = require('mongoose');

async function auditBotProfits() {
    const uri = 'mongodb+srv://tramex2024:vIHKxhFCqFOXC4tf@cluster0.y0qkdw4.mongodb.net/bsb?retryWrites=true&w=majority&appName=Cluster0';
    const TARGET_BOT_ID = "6988087b259fbd1c99fdf8fd";

    try {
        console.log("🔗 Conectando a MongoDB para auditoría de beneficios...");
        await mongoose.connect(uri);
        
        // Accedemos a la colección de ciclos (asumiendo que se llama 'cycles')
        const cyclesCollection = mongoose.connection.collection('cycles');

        // Consultamos todos los ciclos completados para este bot
        const completedCycles = await cyclesCollection.find({
            autobotId: new mongoose.Types.ObjectId(TARGET_BOT_ID),
            status: "COMPLETED"
        }).sort({ strategy: 1, cycleIndex: 1 }).toArray();

        if (completedCycles.length === 0) {
            console.log("⚠️ No se encontraron ciclos completados para este bot.");
            return;
        }

        let totalNetProfit = 0;
        let longProfit = 0;
        let shortProfit = 0;
        let longCount = 0;
        let shortCount = 0;

        console.log(`\n=== REPORTE DETALLADO DE CICLOS (Total: ${completedCycles.length}) ===\n`);

        completedCycles.forEach((cycle) => {
            const profit = parseFloat(cycle.netProfit || 0);
            totalNetProfit += profit;

            if (cycle.strategy.toLowerCase() === 'long') {
                longProfit += profit;
                longCount++;
                console.log(`[LONG]  Ciclo #${cycle.cycleIndex}: +${profit.toFixed(4)} USDT`);
            } else {
                shortProfit += profit;
                shortCount++;
                console.log(`[SHORT] Ciclo #${cycle.cycleIndex}: +${profit.toFixed(4)} USDT`);
            }
        });

        console.log(`\n${"-".repeat(40)}`);
        console.log(`📊 RESUMEN POR ESTRATEGIA:`);
        console.log(`- LONG  (${longCount}/17): ${longProfit.toFixed(4)} USDT`);
        console.log(`- SHORT (${shortCount}/8):  ${shortProfit.toFixed(4)} USDT`);
        console.log(`${"-".repeat(40)}`);
        console.log(`💰 TOTAL NET PROFIT: ${totalNetProfit.toFixed(4)} USDT`);
        console.log(`${"-".repeat(40)}\n`);

    } catch (err) {
        console.error("❌ Error durante la auditoría:", err.message);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
}

auditBotProfits();