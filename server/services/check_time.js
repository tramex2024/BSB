// Archivo: check_time.js
const axios = require('axios');
const API_URL = 'https://api-cloud.bitmart.com';

async function checkTimeSync() {
    console.log("--- Verificando la sincronización del reloj con el servidor de BitMart ---");
    try {
        const response = await axios.get(`${API_URL}/system/time`);
        
        if (response.data && response.data.code === 1000) {
            const bitmartServerTime = parseInt(response.data.data.server_time);
            const localTime = Date.now();
            const timeDifference = Math.abs(localTime - bitmartServerTime);
            
            console.log(`Hora del servidor de BitMart: ${bitmartServerTime} ms`);
            console.log(`Hora local del servidor:     ${localTime} ms`);
            console.log(`Diferencia horaria: ${timeDifference} ms`);

            if (timeDifference > 5000) { // Mayor a 5 segundos
                console.warn(`⚠️ Advertencia: La diferencia de tiempo es significativa. Puede causar errores de firma.`);
            } else {
                console.log(`✅ La sincronización del reloj es correcta.`);
            }
        } else {
            console.error('❌ No se pudo obtener la hora del servidor de BitMart.');
        }
    } catch (error) {
        console.error('❌ Error al conectar con el servidor de BitMart:', error.message);
    }
}

checkTimeSync();