const mongoose = require('mongoose');
const AIBotOrder = require('./server/models/AIBotOrder'); // Asegúrate de que la ruta sea correcta

async function seedAIOrders() {
    const uri = 'mongodb+srv://tramex2024:vIHKxhFCqFOXC4tf@cluster0.y0qkdw4.mongodb.net/bsb?retryWrites=true&w=majority&appName=Cluster0';
    
    try {
        console.log("🔗 Conectando a MongoDB para sembrar órdenes...");
        await mongoose.connect(uri);
        console.log("✅ Conexión establecida.");

        // 1. Definimos las dos órdenes de ejemplo
        const orders = [
            {
                symbol: 'BTC_USDT',
                side: 'BUY',
                price: 88500.25,
                amount: 150.00,
                isVirtual: true,
                confidenceScore: 94,
                status: 'FILLED',
                timestamp: new Date(Date.now() - 3600000) // Hace 1 hora
            },
            {
                symbol: 'BTC_USDT',
                side: 'SELL',
                price: 91200.80,
                amount: 150.00,
                isVirtual: true,
                confidenceScore: 82,
                status: 'FILLED',
                timestamp: new Date() // Ahora mismo
            }
        ];

        console.log("📝 Insertando órdenes de prueba en la colección 'aibotorders'...");
        
        // Usamos insertMany para meter ambas de golpe
        await AIBotOrder.insertMany(orders);

        console.log("✨ ¡Proceso completado!");
        console.log("✅ Se insertó 1 orden de BUY (Confianza 94%)");
        console.log("✅ Se insertó 1 orden de SELL (Confianza 82%)");

    } catch (err) {
        console.error("❌ Error al sembrar datos:", err.message);
    } finally {
        await mongoose.disconnect();
        console.log("🔌 Desconectado.");
        process.exit();
    }
}

seedAIOrders();