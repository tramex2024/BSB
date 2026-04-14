/**
 * BSB DATABASE REPAIR SCRIPT - MARCH 2026
 * FOCUS: Direct update of LONG strategy parameters (8 Real Orders).
 * FIXED: No BTC fee deduction. Pure BTC sum.
 */

const mongoose = require('mongoose');

async function repairLongStrategy() {
    const uri = 'mongodb+srv://tramex2024:vIHKxhFCqFOXC4tf@cluster0.y0qkdw4.mongodb.net/bsb?retryWrites=true&w=majority&appName=Cluster0';
    const TARGET_BOT_ID = new mongoose.Types.ObjectId("6988087b259fbd1c99fdf8fd");

    try {
        console.log("🔗 Conectando a MongoDB para reparación técnica...");
        await mongoose.connect(uri);
        const autobotsCollection = mongoose.connection.collection('autobots');

        // VALORES EXACTOS SEGÚN TICKET:
        // Suma BTC: 0.00459
        // Inversión Total (con fees en USDT): 348.62
        // Nuevo LPPC: 348.62 / 0.00459 = 75952.07
        const updateData = {
            $set: {
                locc: 8,               
                lac: 0.00459,          // Suma exacta de tus 8 órdenes
                lai: 348.62,           // USDT gastados (incluyendo comisiones)
                lppc: 75952.07,        // Precio promedio real
                ltprice: 76331.83,     // Target Price (0.5% profit sobre gasto total)
                lstate: 'BUYING',      
                llep: 65180,           
                lastUpdate: new Date()
            }
        };

        const result = await autobotsCollection.updateOne(
            { _id: TARGET_BOT_ID },
            updateData
        );

        if (result.modifiedCount > 0) {
            console.log(`---------------------------------`);
            console.log(`✅ ACTUALIZACIÓN EXITOSA (VALORES LIMPIOS)`);
            console.log(`- BTC Acumulado (LAC): 0.00459`);
            console.log(`- Inversión Total (LAI): 348.62`);
            console.log(`- Precio Promedio (LPPC): 75952.07`);
            console.log(`- Target Sell Price: 76331.83`);
            console.log(`---------------------------------`);
        } else {
            console.log("⚠️ No se encontró el bot o los datos ya son idénticos.");
        }

    } catch (err) {
        console.error("❌ Error:", err.message);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
}

repairLongStrategy();