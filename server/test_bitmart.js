// Archivo: BSB/server/services/test_bitmart.js

const axios = require('axios');
const CryptoJS = require('crypto-js');
const bitmartService = require('./services/bitmartService'); // Importamos el servicio para usar las funciones

// Las claves se pasarán como argumento a runTest
let API_KEY, API_SECRET, API_MEMO;

const BASE_URL = 'https://api-cloud.bitmart.com';

// He eliminado la función generateSign de aquí, ya que bitmartService y bitmartClient
// ya manejan la firma de manera más robusta. Usaremos las funciones de tu servicio.

async function runTest(credentials) {
    if (!credentials || !credentials.apiKey || !credentials.secretKey) {
        console.error("ERROR: Las credenciales API no se pasaron a la función de prueba.");
        return;
    }

    API_KEY = credentials.apiKey;
    API_SECRET = credentials.secretKey;
    API_MEMO = credentials.memo || "GainBot";

    console.log("--- Verificando credenciales antes de la firma ---");
    console.log(`API Key: ${API_KEY ? '✅ Leída' : '❌ No leída'}`);
    console.log(`Secret Key: ${API_SECRET ? '✅ Leída' : '❌ No leída'}`);
    console.log(`API Memo: ${API_MEMO ? '✅ Leído' : '❌ No leído'}`);
    console.log("--- Fin de la verificación ---");

    try {
        console.log("Iniciando prueba de API de BitMart...");

        // --- Paso 1: Obtener balance de la cuenta ---
        console.log('\n--- Paso 1: Obteniendo Balance de la cuenta ---');
        await bitmartService.getBalance(credentials);

        // --- Paso 2: Obtener Órdenes Abiertas ---
        console.log('\n--- Paso 2: Obteniendo Órdenes Abiertas (V4 POST) ---');
        const openOrdersResult = await bitmartService.getOpenOrders(credentials, 'BTC_USDT');
        if (openOrdersResult.orders.length > 0) {
            console.log(`✅ ¡Órdenes Abiertas obtenidas! Se encontraron ${openOrdersResult.orders.length} órdenes.`);
            openOrdersResult.orders.forEach((order, index) => console.log(`  - Orden ${index + 1}: ID: ${order.order_id}, Símbolo: ${order.symbol}, Estado: ${order.state}`));
        } else {
            console.log('ℹ️ No se encontraron órdenes abiertas.');
        }

        // --- Paso 3: Obtener Historial de Órdenes ---
        console.log(`\n--- Paso 3: Listando Historial de Órdenes (V4 POST) ---`);
        const now = Date.now();
        const ninetyDaysAgo = now - (90 * 24 * 60 * 60 * 1000);
        const historyOrders = await bitmartService.getHistoryOrders(credentials, {
            symbol: 'BTC_USDT',
            orderMode: 'spot',
            startTime: ninetyDaysAgo,
            endTime: now,
            limit: 10
        });

        if (historyOrders.length > 0) {
            console.log(`✅ ¡Historial de órdenes obtenido! Se encontraron ${historyOrders.length} órdenes.`);
            historyOrders.slice(0, 5).forEach((order, index) => console.log(`  - Orden Histórica ${index + 1}: ID: ${order.order_id}, Símbolo: ${order.symbol}, Estado: ${order.state}`));
            if (historyOrders.length > 5) console.log(`...y ${historyOrders.length - 5} órdenes más.`);
        } else {
            console.log('ℹ️ No se encontraron órdenes en el historial.');
        }

    } catch (error) {
        console.error('\n❌ Falló la prueba de la API de BitMart.');
        console.error('Error:', error.message);
    }
}

module.exports = {
    runTest
};