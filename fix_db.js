// fix_db.js
const mongoose = require('mongoose');
const Autobot = require('./server/models/Autobot'); // Ajusta la ruta si es necesario
require('dotenv').config();

async function fix() {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const ppc = 90975;
    const profit_percent = 1.5;
    const price_var = 1.5;
    const purchaseUsdt = 6;
    
    const ltprice = ppc * (1 + profit_percent / 100);
    const lcoverage = ppc * (1 - price_var / 100);
    const requiredCoverageAmount = purchaseUsdt * 2; // Siguiente orden (2da)

    await Autobot.findOneAndUpdate({}, {
        $set: {
            ltprice: ltprice,
            lcoverage: lcoverage,
            lnorder: 2,
            "lStateData.ppc": ppc,
            "lStateData.nextCoveragePrice": lcoverage,
            "lStateData.requiredCoverageAmount": requiredCoverageAmount,
            "lStateData.orderCountInCycle": 1,
            "lStateData.lastExecutionPrice": ppc
        }
    });

    console.log("✅ Base de datos sincronizada. ltprice:", ltprice);
    process.exit();
}

fix();