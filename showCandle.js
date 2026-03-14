/**
 * AUDITORÍA DE DATOS DE MERCADO (BTC_USDT)
 * Este script verifica la entrada de velas en tiempo real para el AI Bot.
 */
const mongoose = require('mongoose');

// --- CONFIGURACIÓN DE IDENTIDAD ---
const MONGO_URI = 'mongodb+srv://tramex2024:vIHKxhFCqFOXC4tf@cluster0.y0qkdw4.mongodb.net/bsb?retryWrites=true&w=majority&appName=Cluster0';
const SYMBOL = 'BTC_USDT';

// Definición mínima del modelo para la auditoría
const MarketSignalSchema = new mongoose.Schema({
    symbol: String,
    currentPrice: Number,
    history: Array,
    lastUpdate: Date,
    rsi14: Number,
    adx: Number
});

const MarketSignal = mongoose.models.MarketSignal || mongoose.model('MarketSignal', MarketSignalSchema);

async function auditMarketData() {
    try {
        const signal = await MarketSignal.findOne({ symbol: SYMBOL }).lean();

        if (!signal) {
            console.log(`[${new Date().toLocaleTimeString()}] ❌ ERROR: No se encontró el documento ${SYMBOL} en la colección.`);
            return;
        }

        const history = signal.history || [];
        const count = history.length;
        
        console.log(`\n============================================`);
        console.log(`📊 REPORTE DE MERCADO: ${SYMBOL}`);
        console.log(`🕒 Hora Local: ${new Date().toLocaleString()}`);
        console.log(`--------------------------------------------`);
        console.log(`💰 Precio Actual: $${signal.currentPrice?.toFixed(2) || 'N/A'}`);
        console.log(`📉 RSI 14: ${signal.rsi14?.toFixed(2) || 'N/A'}`);
        console.log(`⚡ ADX: ${signal.adx?.toFixed(2) || 'N/A'}`);
        console.log(`📚 Velas en Historial: ${count} / 100 mínimas`);
        
        // Verificación de salud del motor
        if (count < 100) {
            console.log(`🔴 ESTADO: IA INACTIVA (Faltan ${100 - count} velas para el análisis)`);
        } else {
            console.log(`🟢 ESTADO: IA ACTIVA (Datos suficientes para procesar)`);
        }

        console.log(`\nÚLTIMAS 3 VELAS REGISTRADAS:`);
        if (count > 0) {
            const lastThree = history.slice(-3).reverse(); 
            lastThree.forEach((candle, index) => {
                // Verificamos si el timestamp es numérico o fecha
                const timeLabel = new Date(candle.timestamp).toLocaleTimeString();
                console.log(`   [Vela t-${index}] ${timeLabel} | Close: $${candle.close} | Vol: ${candle.volume}`);
            });
        } else {
            console.log("   ⚠️ Array 'history' vacío.");
        }
        
        console.log(`============================================`);

    } catch (error) {
        console.error("❌ Error consultando MongoDB:", error.message);
    }
}

// Conexión y ciclo de ejecución
async function start() {
    try {
        console.log("🔗 Conectando a MongoDB...");
        await mongoose.connect(MONGO_URI);
        console.log("✅ Conexión establecida.");
        
        // Ejecución inmediata
        await auditMarketData();
        
        // Intervalo de 1 minuto (60000ms)
        setInterval(async () => {
            await auditMarketData();
        }, 60000);

    } catch (err) {
        console.error("❌ Error de inicio:", err.message);
        process.exit(1);
    }
}

start();