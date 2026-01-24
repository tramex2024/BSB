// BSB/server/cleanup_db.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Autobot = require('./server/models/Autobot'); // Asegúrate de que la ruta sea correcta

dotenv.config();

async function purgeDatabase() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Conectado a MongoDB para limpieza...');

        const result = await Autobot.updateMany({}, {
            $unset: { 
                // Objetos anidados antiguos
                lStateData: "", 
                sStateData: "",
                // Variables duplicadas o antiguas
                lreqAmount: "",
                sreqAmount: "",
                lpc: "",
                lpm: "",
                spc: "",
                spm: "",
                // Cualquier otro campo que no esté en tu nuevo modelo
            }
        });

        console.log(`🧹 Limpieza completada. Documentos modificados: ${result.modifiedCount}`);
        process.exit(0);
    } catch (error) {
        console.error('❌ Error durante la limpieza:', error);
        process.exit(1);
    }
}

purgeDatabase();