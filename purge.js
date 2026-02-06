const mongoose = require('mongoose');

async function restoreShortStrategy() {
    try {
        const uri = 'mongodb+srv://tramex2024:vIHKxhFCqFOXC4tf@cluster0.y0qkdw4.mongodb.net/bsb?retryWrites=true&w=majority&appName=Cluster0';
        
        console.log("🔗 Conectando a MongoDB para restauración de emergencia...");
        await mongoose.connect(uri);
        
        const collection = mongoose.connection.collection('autobots');
        const filter = { _id: new mongoose.Types.ObjectId("690fd622ced7eb324d1ffa2f") };

        // Parámetros calculados basados en tus 4 órdenes ejecutadas
        const update = {
            $set: {
                "sstate": "SELLING",      // Volvemos a ponerlo en modo venta (esperando profit)
                "sbalance": 91.01,        // El balance que quedó tras las compras
                "sai": 49.98,             // Inversión acumulada en el ciclo actual
                "sac": 0.00056,           // Cantidad total de BTC en posesión
                "sppc": 89252.85,         // Precio promedio de venta
                "stprice": 88092.57,      // PRECIO OBJETIVO PARA CERRAR EN PROFIT
                "socc": 4,                // Contador de órdenes actuales
                "slep": 89744.82,         // Último precio de ejecución
                "sncp": 90283.28,         // Siguiente nivel de DCA si sigue subiendo
                "sstartTime": new Date(), // Reiniciamos el reloj de este ciclo
                "spm": 0,                 // Reset de trailing
                "spc": 0                  // Reset de trailing
            }
        };

        console.log("🛠️ Restaurando parámetros de la estrategia Short...");
        const result = await collection.updateOne(filter, update);

        if (result.matchedCount > 0) {
            console.log("✨ ¡RESTAURACIÓN COMPLETADA!");
            console.log(`- La estrategia Short ahora tiene 4 órdenes acumuladas.`);
            console.log(`- El bot buscará vender en: $88,092.57`);
            console.log(`- El balance del Short se mantiene en 91.01 USDT.`);
        } else {
            console.log("⚠️ No se encontró el documento.");
        }

    } catch (err) {
        console.error("❌ Error crítico:", err.message);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
}

restoreShortStrategy();