const mongoose = require('mongoose');
const axios = require('axios');

async function reach250Velas() {
    const uri = 'mongodb+srv://tramex2024:vIHKxhFCqFOXC4tf@cluster0.y0qkdw4.mongodb.net/bsb?retryWrites=true&w=majority&appName=Cluster0';
    const SYMBOL = 'BTC_USDT';

    try {
        console.log("🔗 Conectando a MongoDB...");
        await mongoose.connect(uri);
        const signalsCollection = mongoose.connection.collection('marketsignals');

        // 1. PRIMER LLAMADO: Las 200 más recientes
        console.log(`📡 Solicitando bloque 1 (Recientes)...`);
        const res1 = await axios.get('https://api-cloud.bitmart.com/spot/quotation/v3/klines', {
            params: { symbol: SYMBOL, limit: 200, step: 1 },
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const klines1 = res1.data.data;

        // 2. SEGUNDO LLAMADO: Basado en el timestamp de la más antigua del bloque anterior
        // Usamos el parámetro 'before' con el timestamp de la primera vela recibida
        const oldestTimestamp = klines1[0][0]; 
        console.log(`📡 Solicitando bloque 2 (Históricas para completar)...`);
        const res2 = await axios.get('https://api-cloud.bitmart.com/spot/quotation/v3/klines', {
            params: { 
                symbol: SYMBOL, 
                limit: 100, 
                step: 1, 
                before: oldestTimestamp 
            },
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const klines2 = res2.data.data;

        // 3. COMBINAR Y FORMATEAR
        const allKlines = [...klines1, ...klines2];
        const formatted = allKlines.map(k => ({
            timestamp: parseInt(k[0]) * 1000,
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5])
        }));

        // 4. LIMPIEZA DE DUPLICADOS Y RECORTE A 250
        const uniqueMap = new Map();
        formatted.forEach(v => uniqueMap.set(v.timestamp, v));
        
        const finalHistory = Array.from(uniqueMap.values())
            .sort((a, b) => a.timestamp - b.timestamp)
            .slice(-250); // Tomamos las 250 más nuevas de este conjunto

        console.log(`✅ Procesadas ${finalHistory.length} velas únicas.`);

        // 5. ACTUALIZAR DB
        await signalsCollection.updateOne(
            { symbol: SYMBOL },
            { 
                $set: { 
                    history: finalHistory,
                    lastUpdate: new Date()
                } 
            },
            { upsert: true }
        );

        console.log(`\n🚀 OBJETIVO ALCANZADO`);
        console.log(`---------------------------------`);
        console.log(`- Total final en DB: ${finalHistory.length}`);
        console.log(`- Rango: ${new Date(finalHistory[0].timestamp).toLocaleString()} a ${new Date(finalHistory[finalHistory.length-1].timestamp).toLocaleString()}`);
        console.log(`---------------------------------`);

    } catch (err) {
        console.error("❌ Error:", err.message);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
}

reach250Velas();