const mongoose = require('mongoose');

async function recoverBotCycle() {
    try {
        const uri = 'mongodb+srv://tramex2024:vIHKxhFCqFOXC4tf@cluster0.y0qkdw4.mongodb.net/bsb?retryWrites=true&w=majority&appName=Cluster0';
        
        console.log("🔗 Connecting to MongoDB to recover multi-user cycle...");
        await mongoose.connect(uri);
        
        const collection = mongoose.connection.collection('autobots');
        
        // IMPORTANTE: Filtramos por el ID del nuevo registro multiusuario
        const filter = { _id: new mongoose.Types.ObjectId("6988087b259fbd1c99fdf8fd") };

        const update = {
            $set: {
                // --- GLOBAL STATE ---
                "total_profit": 12.624578,
                "lastAvailableUSDT": 16.26178733,
                "lastAvailableBTC": 0.00454,
                "lastUpdate": new Date(),

                // --- LONG CYCLE RECOVERY (The active operation) ---
                "lstate": "PAUSED", // Para que no dispare órdenes nuevas de inmediato al arrancar
                "lcycle": 13,
                "lbalance": 3.3062621,
                "ltprice": 85025.88814022901,
                "lprofit": -38.14497392080001,
                "lac": 0.00262,
                "lai": 219.90900980000004,
                "lppc": 83934.7365648855,
                "locc": 7, // 7 órdenes abiertas capturadas
                "lncp": 80505.09988336416,
                "llep": 82336.38,
                "lrca": 128.9653786453125,
                "lstartTime": new Date("2026-01-28T02:35:30.747Z"),
                "lcoverage": 69529.05,

                // --- SHORT STATE (Reset/Stopped) ---
                "sstate": "STOPPED",
                "scycle": 3,
                "sbalance": 141,
                "stprice": 0,
                "sprofit": 0,
                "sac": 0,
                "sai": 0,
                "sppc": 0,
                "socc": 0,
                "snorder": 0,

                // --- AI STATE (From your working backup) ---
                "aistate": "RUNNING",
                "aibalance": 94.72176697655406,
                "aihighestPrice": 69564.9,
                "ailastEntryPrice": 69564.9,

                // --- CONFIGURATION SYNC ---
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
                        "amountUsdt": 141,
                        "purchaseUsdt": 6,
                        "price_var": 0.5,
                        "size_var": 55,
                        "profit_percent": 1.3,
                        "price_step_inc": 35,
                        "stopAtCycle": true,
                        "enabled": false
                    },
                    "ai": {
                        "amountUsdt": 100,
                        "stopAtCycle": true,
                        "enabled": true
                    }
                }
            }
        };

        console.log("🛠️ Injecting cycle data into user 69880862881f8789a039d0a3...");
        const result = await collection.updateOne(filter, update);

        if (result.matchedCount > 0) {
            console.log("✨ BOT RECOVERED SUCCESSFULLY ✨");
            console.log("- Long: PAUSED (Cycle 13, 7 Orders)");
            console.log("- AI: RUNNING");
            console.log("- UI should now reflect the $219.90 investment in Long.");
        } else {
            console.log("⚠️ Document not found. Check the _id of the new bot.");
        }

    } catch (err) {
        console.error("❌ Error:", err.message);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
}

recoverBotCycle();