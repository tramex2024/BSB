const mongoose = require('mongoose');

async function cleanAndSyncDB() {
    try {
        const uri = 'mongodb+srv://tramex2024:vIHKxhFCqFOXC4tf@cluster0.y0qkdw4.mongodb.net/bsb?retryWrites=true&w=majority&appName=Cluster0';
        
        console.log("🔗 Conectando a MongoDB para limpieza y sincronización...");
        await mongoose.connect(uri);
        
        const collection = mongoose.connection.collection('autobots');
        const filter = { _id: new mongoose.Types.ObjectId("690fd622ced7eb324d1ffa2f") };

        const update = {
            $set: {
                // --- ESTADO GENERAL ---
                "total_profit": 12.1223126345,
                "lastAvailableUSDT": 21.26678733,
                "lastAvailableBTC": 0.00454,
                "lastUpdate": new Date(),

                // --- LONG: MANTENER VALORES ACTUALES ---
                "lstate": "PAUSED",
                "lcycle": 13,
                "lbalance": 3.3062621,
                "ltprice": 85025.88814022901,
                "lprofit": -14.29365371620002,
                "lac": 0.00262,
                "lai": 219.90900980000004,
                "lppc": 83934.7365648855,
                "locc": 7,
                "lncp": 83934.7365648855,
                "llep": 82336.38,

                // --- SHORT: RESET TOTAL (STOPPED) ---
                "sstate": "STOPPED",
                "scycle": 3,
                "sbalance": 141, // Valor de tu JSON
                "stprice": 0,
                "sprofit": 0,
                "sac": 0,
                "sai": 0,
                "sppc": 0,
                "socc": 0,
                "slep": 0,
                "sncp": 0,
                "spm": 0,
                "spc": 0,
                "sstartTime": null,

                // --- CONFIGURACIÓN (Sincronizada con el Dashboard) ---
                "config": {
                    "symbol": "BTC_USDT",
                    "long": {
                        "amountUsdt": 224,
                        "purchaseUsdt": 6,
                        "price_var": 0.5,
                        "size_var": 55,
                        "profit_percent": 1.3,
                        "price_step_inc": 35,
                        "stopAtCycle": true,
                        "enabled": true
                    },
                    "short": {
                        "amountUsdt": 224,
                        "purchaseUsdt": 6,
                        "price_var": 0.5,
                        "size_var": 55,
                        "profit_percent": 1.3,
                        "price_step_inc": 35,
                        "stopAtCycle": true,
                        "enabled": true
                    },
                    "ai": {
                        "amountUsdt": 0,
                        "stopAtCycle": false,
                        "enabled": false
                    }
                },
                "aibalance": 0
            }
        };

        console.log("🛠️ Aplicando limpieza de Short y actualización de Long...");
        const result = await collection.updateOne(filter, update);

        if (result.matchedCount > 0) {
            console.log("✨ BASE DE DATOS ACTUALIZADA ✨");
            console.log("- Long: Activo/Paused (Ciclo 13)");
            console.log("- Short: Reseteado a 0 (Stopped)");
            console.log("- Config: Sincronizada.");
        } else {
            console.log("⚠️ No se encontró el documento.");
        }

    } catch (err) {
        console.error("❌ Error:", err.message);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
}

cleanAndSyncDB();