const mongoose = require('mongoose');
const Autobot = require('./server/models/Autobot');

async function transferData() {
    try {
        // Cambia la URI por la tuya
        await mongoose.connect('mongodb+srv://tramex2024:vIHKxhFCqFOXC4tf@cluster0.y0qkdw4.mongodb.net/bsb?retryWrites=true&w=majority&appName=Cluster0');
        console.log("✅ Conectado para trasvase...");

        const bot = await Autobot.findOne({ _id: "690fd622ced7eb324d1ffa2f" });

        if (!bot) {
            console.log("❌ Bot no encontrado");
            return;
        }

        // --- TRASVASE DE SHORT (Los datos activos) ---
        const s = bot.sStateData;
        bot.sppc = s.ppc;                  // 95156.14
        bot.sac  = s.ac;                   // 0.00193
        bot.sai  = s.ai;                   // 183.65
        bot.snorder = s.orderCountInCycle; // 5
        bot.spm  = s.pm;
        bot.spc  = s.pc;
        bot.sbprice = s.lastExecutionPrice; // 96233.81
        bot.sreqAmount = s.requiredCoverageAmount; // 192
        bot.scoverage = s.nextCoveragePrice; // 97677.31
        bot.sstartTime = s.cycleStartTime;

        // --- TRASVASE DE LONG (Valores en 0 actualmente) ---
        const l = bot.lStateData;
        bot.lppc = l.ppc;
        bot.lac  = l.ac;
        bot.lai  = l.ai;
        bot.lnorder = l.orderCountInCycle;
        bot.lpm  = l.pm;
        bot.lpc  = l.pc;
        bot.lsprice = l.lastExecutionPrice;
        bot.lreqAmount = l.requiredCoverageAmount;
        bot.lcoverage = l.nextCoveragePrice;
        bot.lstartTime = l.cycleStartTime;

        // Guardamos los cambios. lStateData y sStateData NO se tocan.
        await bot.save();

        console.log("🚀 Trasvase completado con éxito.");
        console.log(`Verificación Short: SAI ahora es ${bot.sai} y SPPC es ${bot.sppc}`);
        
        process.exit(0);
    } catch (error) {
        console.error("❌ Error:", error);
        process.exit(1);
    }
}

transferData();