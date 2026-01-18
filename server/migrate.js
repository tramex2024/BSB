const mongoose = require('mongoose');
// Importa tu modelo aquí
const Autobot = require('./models/Autobot'); 

const MONGO_URI = 'tu_cadena_de_conexion_a_mongodb';

async function migrateBotData() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("✅ Conectado a MongoDB para migración...");

        const bot = await Autobot.findOne({ _id: "690fd622ced7eb324d1ffa2f" });

        if (!bot) {
            console.error("❌ No se encontró el bot con ese ID.");
            return;
        }

        console.log("⏳ Migrando datos operativos...");

        // 1. Migración de LONG (desde lStateData a raíz)
        if (bot._doc.lStateData) {
            bot.ltprice = bot._doc.lStateData.ppc || 0;     // Precio Promedio
            bot.lnorder = bot._doc.lStateData.orderCountInCycle || 0; // Coberturas
            bot.lsprice = bot._doc.lStateData.lastExecutionPrice || 0; // Último precio
            // El lbalance ya lo tienes en 186, se mantiene.
        }

        // 2. Migración de SHORT (desde sStateData a raíz)
        if (bot._doc.sStateData) {
            bot.stprice = bot._doc.sStateData.ppc || 0;     // Precio Promedio
            bot.snorder = bot._doc.sStateData.orderCountInCycle || 0; // Coberturas
            bot.sbprice = bot._doc.sStateData.lastExecutionPrice || 0; // Último precio
            bot.sbalance = bot._doc.sStateData.ai || 0;     // Capital real invertido
        }

        // 3. Sincronizar fechas
        bot.lastUpdate = new Date();

        // 4. Guardar los cambios en el nuevo esquema
        await bot.save();

        // 5. Limpiar parámetros antiguos (Unset)
        await Autobot.updateOne(
            { _id: bot._id },
            { 
                $unset: { 
                    lStateData: "", 
                    sStateData: "", 
                    lastUpdateTime: "", 
                    lastBalanceCheck: "" 
                } 
            }
        );

        console.log("🚀 Migración completada con éxito. Los datos ahora están en la raíz.");
        process.exit(0);

    } catch (error) {
        console.error("❌ Error durante la migración:", error);
        process.exit(1);
    }
}

migrateBotData();