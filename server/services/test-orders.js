require('dotenv').config();
const axios = require('axios');
const CryptoJS = require('crypto-js');

const BASE_URL = 'https://api-cloud.bitmart.com';

const credentials = {
    apiKey: process.env.BITMART_API_KEY,
    secretKey: process.env.BITMART_SECRET_KEY,
    memo: process.env.BITMART_API_MEMO,
};

if (!credentials.apiKey || !credentials.secretKey || !credentials.memo) {
    console.error("ERROR: Las credenciales de la API no están configuradas en el archivo .env.");
    process.exit(1);
}

// =============================================================================================
// makeRequest - Lógica de Firma de BitMart (Punto de la corrección)
// =============================================================================================
function generateSign(timestamp, body, secretKey) {
    const message = timestamp + '#' + credentials.memo + '#' + body;
    return CryptoJS.HmacSHA256(message, secretKey).toString(CryptoJS.enc.Hex);
}

async function makeRequest(method, path, params = {}, body = {}) {
    const timestamp = Date.now().toString();
    const url = `${BASE_URL}${path}`;

    let bodyForSign = '';
    let requestUrl = url;

    // La lógica de firma varía si es GET o POST.
    if (method === 'GET') {
        if (Object.keys(params).length > 0) {
            const queryString = new URLSearchParams(params).toString();
            requestUrl = `${url}?${queryString}`;
        }
        // Para solicitudes GET, el cuerpo para la firma siempre es una cadena vacía
        bodyForSign = '';
    } else if (method === 'POST') {
        bodyForSign = JSON.stringify(body);
    }
    
    const sign = generateSign(timestamp, bodyForSign, credentials.secretKey);

    const headers = {
        'Content-Type': 'application/json',
        'X-BM-KEY': credentials.apiKey,
        'X-BM-TIMESTAMP': timestamp,
        'X-BM-SIGN': sign,
    };

    console.log(`\n--- Realizando solicitud ${method} a ${path} ---`);
    console.log("Headers:", headers);
    console.log("Body:", body);
    console.log("URL de la Solicitud:", requestUrl);

    try {
        const response = await axios({
            method,
            url: requestUrl,
            headers,
            data: body,
            params: method === 'GET' ? params : undefined,
        });

        if (response.data.code === 1000) {
            console.log("✅ Éxito:", JSON.stringify(response.data, null, 2));
            return response.data;
        } else {
            console.error(`❌ Falló la solicitud a BitMart en ${path}: ${response.data.message} (Code: ${response.data.code})`);
            throw new Error(`Error de la API: ${response.data.message} (Code: ${response.data.code})`);
        }
    } catch (error) {
        console.error(`❌ Error en la solicitud a ${path}:`, error.response ? error.response.data : error.message);
        throw error;
    }
}

// =============================================================================================
// Funciones de Prueba
// =============================================================================================

async function testWalletBalance() {
    try {
        // Volvemos al endpoint v1 que tu código original usaba, ya que el v4 falló.
        const response = await makeRequest('GET', '/account/v1/wallet');
        console.log("TEST: Balances de la billetera obtenidos con éxito.");
        return response.data;
    } catch (error) {
        console.error("TEST: Falló al obtener los balances de la billetera.");
        return null;
    }
}

async function testOpenOrders(symbol = 'BTC_USDT') {
    try {
        const requestBody = { symbol };
        const response = await makeRequest('POST', '/spot/v4/query/open-orders', {}, requestBody);
        console.log("TEST: Órdenes abiertas obtenidas con éxito.");
        return response.data;
    } catch (error) {
        console.error("TEST: Falló al obtener las órdenes abiertas.");
        return null;
    }
}

async function testHistoryOrders(symbol = 'BTC_USDT', status = 'filled') {
    const orderStatusMap = {
        'filled': 1,
        'cancelled': 6,
        'all': 0
    };
    const statusCode = orderStatusMap[status];

    const requestBody = {
        symbol: symbol,
        orderMode: 'spot',
        limit: 10,
        status: statusCode,
    };

    try {
        // El historial de órdenes requiere POST, no GET
        const response = await makeRequest('POST', '/spot/v4/query/history-orders', {}, requestBody);
        console.log(`TEST: Historial de órdenes (${status}) obtenido con éxito.`);
        return response.data;
    } catch (error) {
        console.error(`TEST: Falló al obtener el historial de órdenes (${status}).`);
        return null;
    }
}

// =============================================================================================
// Ejecución de las Pruebas
// =============================================================================================

async function runTests() {
    console.log("=== Iniciando pruebas de la API de BitMart ===");
    await testWalletBalance();
    await testOpenOrders();
    await testHistoryOrders('BTC_USDT', 'filled');
    await testHistoryOrders('BTC_USDT', 'cancelled');
    console.log("\n=== Pruebas finalizadas ===");
}

runTests();
