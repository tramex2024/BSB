// Archivo: bot.js (VALIDADO Y LISTO PARA TRANSFERIR LÓGICA)

const axios = require('axios');
const CryptoJS = require('crypto-js');
require('dotenv').config();
const http = require('http'); 
const https = require('https'); 

const BASE_URL = 'https://api-cloud.bitmart.com';

const ORDEN_ID_A_BUSCAR = '1289264299395252480';
const SIMBOLO_A_PROBAR = 'BTC_USDT'; 

// --------------------------------------------------------------------------
// TEST 1: Consulta Balance (Validado)
// --------------------------------------------------------------------------
async function testBalance() {
    // makeRequest para el TEST 1
    async function makeRequest(method, path, params = {}, body = {}) {
        const { BITMART_API_KEY, BITMART_SECRET_KEY, BITMART_API_MEMO } = process.env;
        const credentials = { apiKey: BITMART_API_KEY, secretKey: BITMART_SECRET_KEY, memo: BITMART_API_MEMO };
        if (!credentials.apiKey || !credentials.secretKey || !credentials.memo) { throw new Error("Credenciales de API no configuradas."); }
        const timestamp = Date.now().toString();
        let bodyForSign = '';
        if (method === 'POST') { bodyForSign = JSON.stringify(body); if (bodyForSign === '{}') { bodyForSign = ''; } }
        const message = timestamp + '#' + credentials.memo + '#' + bodyForSign;
        const sign = CryptoJS.HmacSHA256(message, credentials.secretKey).toString(CryptoJS.enc.Hex);
        const headers = { 'Content-Type': 'application/json', 'X-BM-KEY': credentials.apiKey, 'X-BM-TIMESTAMP': timestamp, 'X-BM-SIGN': sign, };
        const agentOptions = { family: 4 };

        try {
            const config = { method, url: `${BASE_URL}${path}`, headers, timeout: 10000, httpAgent: new http.Agent(agentOptions), httpsAgent: new https.Agent(agentOptions), };
            if (method === 'GET') { config.params = params; } else if (method === 'POST') { config.data = body; }
            const response = await axios(config);
            if (response.data.code === 1000) { return response.data; } else { throw new Error(`Error de la API: ${response.data.message} (Code: ${response.data.code})`); }
        } catch (error) {
            throw new Error(`Falló la solicitud a BitMart en ${path}: ${error.response ? error.response.data.message || 'Error Desconocido' : error.message}`);
        }
    }
    
    let usdtAvailable = 'N/A';
    let rawWalletData = null;
    
    try {
        console.log('\n[TEST 1] Consultando Balance (GET /account/v1/wallet) ...');
        const balanceResponse = await makeRequest('GET', '/account/v1/wallet'); 
        
        if (balanceResponse.data && balanceResponse.data.wallet) {
            console.log('✅ TEST 1: ¡CONEXIÓN BÁSICA EXITOSA! La respuesta de la API se recibió.');
            rawWalletData = balanceResponse.data.wallet;
            const usdtWallet = rawWalletData.find(w => w.currency && (w.currency.toUpperCase() === 'USDT' || w.currency.toUpperCase() === 'USD'));
            
            if (usdtWallet) {
                let balanceValue = usdtWallet.available;
                if (parseFloat(balanceValue) <= 0) { balanceValue = usdtWallet.total; }
                usdtAvailable = parseFloat(balanceValue || 0).toFixed(4);
            }
            console.log(`Saldo disponible de USDT: ${usdtAvailable}`); 
        } else {
            console.log('❌ TEST 1: Fallo al obtener el balance o credenciales incorrectas.');
        }
    } catch (error) {
        console.error('❌ TEST 1: Error al consultar el balance.');
        console.error('Mensaje de error:', error.message);
    }
    return rawWalletData;
}

// --------------------------------------------------------------------------
// TEST 2: Historial de Órdenes (Validado)
// --------------------------------------------------------------------------

async function testHistoryOrders() {
    let allOrders = [];
    // makeRequest para el TEST 2
    async function makeRequest(method, path, params = {}, body = {}) {
        const { BITMART_API_KEY, BITMART_SECRET_KEY, BITMART_API_MEMO } = process.env;
        const credentials = { apiKey: BITMART_API_KEY, secretKey: BITMART_SECRET_KEY, memo: BITMART_API_MEMO };
        if (!credentials.apiKey || !credentials.secretKey || !credentials.memo) { throw new Error("Credenciales de API no configuradas."); }
        const timestamp = Date.now().toString();
        let bodyForSign = '';
        if (method === 'POST') { bodyForSign = JSON.stringify(body); if (bodyForSign === '{}') { bodyForSign = ''; } }
        const message = timestamp + '#' + credentials.memo + '#' + bodyForSign;
        const sign = CryptoJS.HmacSHA256(message, credentials.secretKey).toString(CryptoJS.enc.Hex);
        const headers = { 'Content-Type': 'application/json', 'X-BM-KEY': credentials.apiKey, 'X-BM-TIMESTAMP': timestamp, 'X-BM-SIGN': sign, };
        const agentOptions = { family: 4 };

        try {
            const config = { method, url: `${BASE_URL}${path}`, headers, timeout: 10000, httpAgent: new http.Agent(agentOptions), httpsAgent: new https.Agent(agentOptions), };
            if (method === 'GET') { config.params = params; } else if (method === 'POST') { config.data = body; }
            const response = await axios(config);
            if (response.data.code === 1000) { return response.data; } else { throw new Error(`Error de la API: ${response.data.message} (Code: ${response.data.code})`); }
        } catch (error) {
            throw new Error(`Falló la solicitud a BitMart en ${path}: ${error.response ? error.response.data.message || 'Error Desconocido' : error.message}`);
        }
    }

    try {
        console.log('\n[TEST 2] MOSTRANDO HISTORIAL DE ÓRDENES (V4/query/history-orders - POST) ...');
        const endpoint = '/spot/v4/query/history-orders';
        const requestBody = { symbol: SIMBOLO_A_PROBAR, orderMode: 'spot', limit: 100 };
        const response = await makeRequest('POST', endpoint, {}, requestBody);
        
        if (response.data && Array.isArray(response.data)) {
            allOrders = response.data;
        }

        if (allOrders.length > 0) {
            console.log(`✅ TEST 2: ¡Historial recuperado con éxito! Total de órdenes: ${allOrders.length}`);
            const summary = allOrders.slice(0, 5).map(o => ({ id: o.orderId, state: o.state }));
            console.log('Primeras 5 órdenes del historial:');
            console.log(JSON.stringify(summary, null, 2));
        } else {
            console.log('✅ TEST 2: Historial recuperado, pero la lista está vacía.');
        }
    } catch (error) {
        console.error(`❌ TEST 2: Fallo en la consulta del Historial de Órdenes.`);
        console.error('Mensaje de error:', error.message);
    }
    return allOrders;
}


// --------------------------------------------------------------------------
// TEST 3: Detalle de Orden por ID (Busca en la lista del Test 2) - Validado
// --------------------------------------------------------------------------
async function testOrderDetail(allOrders) {
    try {
        console.log(`\n[TEST 3] ENCONTRANDO DETALLE por Order ID: ${ORDEN_ID_A_BUSCAR} (Buscar en Historial V4) ...`);
        if (allOrders.length === 0) {
            console.log('❌ No hay órdenes en la lista para buscar. Saltando la búsqueda.');
            return null;
        }
        const orderDetails = allOrders.find(o => o.orderId === ORDEN_ID_A_BUSCAR);

        if (orderDetails) {
            console.log(`✅ TEST 3: ¡Detalles de la orden ${ORDEN_ID_A_BUSCAR} encontrados! (Vía Historial)`);
            console.log(`Estado: ${orderDetails.state}, Lado: ${orderDetails.side}, Precio Promedio: ${orderDetails.priceAvg}`);
        } else {
            console.log(`❌ TEST 3: Orden ${ORDEN_ID_A_BUSCAR} no encontrada en el historial reciente de ${allOrders.length} órdenes.`);
        }
        return orderDetails;
    } catch (error) {
        console.error(`❌ TEST 3: Error inesperado en la búsqueda de Detalle.`);
        console.error('Mensaje de error:', error.message);
        return null;
    }
}

// --------------------------------------------------------------------------
// TEST 4: Detalle de Orden Directo (V4 POST) - DIAGNÓSTICO FINAL
// --------------------------------------------------------------------------
async function testOrderDetailDirect() {
    
    // makeRequest para el TEST 4 (CON DIAGNÓSTICO DE RESPUESTA)
    async function makeRequest(method, path, params = {}, body = {}) {
        const { BITMART_API_KEY, BITMART_SECRET_KEY, BITMART_API_MEMO } = process.env;
        const credentials = { apiKey: BITMART_API_KEY, secretKey: BITMART_SECRET_KEY, memo: BITMART_API_MEMO };
        if (!credentials.apiKey || !credentials.secretKey || !credentials.memo) { throw new Error("Credenciales de API no configuradas."); }
        const timestamp = Date.now().toString();
        let bodyForSign = '';
        if (method === 'POST') { bodyForSign = JSON.stringify(body); if (bodyForSign === '{}') { bodyForSign = ''; } }
        const message = timestamp + '#' + credentials.memo + '#' + bodyForSign;
        const sign = CryptoJS.HmacSHA256(message, credentials.secretKey).toString(CryptoJS.enc.Hex);
        const headers = { 'Content-Type': 'application/json', 'X-BM-KEY': credentials.apiKey, 'X-BM-TIMESTAMP': timestamp, 'X-BM-SIGN': sign, };
        const agentOptions = { family: 4 };

        try {
            const config = { method, url: `${BASE_URL}${path}`, headers, timeout: 10000, httpAgent: new http.Agent(agentOptions), httpsAgent: new https.Agent(agentOptions), };
            if (method === 'GET') { config.params = params; } else if (method === 'POST') { config.data = body; }
            const response = await axios(config);
            
            if (response.data.code === 1000) { 
                // 🚨 DIAGNÓSTICO CRUDO DE RESPUESTA EXITOSA (para ver si viene vacía)
                if (!response.data.data) {
                    console.log('\n--- DIAGNÓSTICO CRUDO: RESPUESTA V4 DETALLE (VACÍA) ---');
                    console.log(JSON.stringify(response.data, null, 2));
                    console.log('------------------------------------------------------');
                }
                return response.data; 
            } else {
                // IMPRIMIR RESPUESTA DE ERROR COMPLETA SI NO ES 1000
                console.log('\n--- DIAGNÓSTICO CRUDO: RESPUESTA DE ERROR DEL TEST 4 ---');
                console.log(JSON.stringify(response.data, null, 2));
                console.log('------------------------------------------------------');
                throw new Error(`Error de la API: ${response.data.message} (Code: ${response.data.code})`);
            }
        } catch (error) {
            throw new Error(`Falló la solicitud a BitMart en ${path}: ${error.response ? error.response.data.message || 'Error Desconocido' : error.message}`);
        }
    }

    const ORDEN_ID = ORDEN_ID_A_BUSCAR;
    const SYMBOL = SIMBOLO_A_PROBAR;

    try {
        console.log('\n[TEST 4] Consultando Detalle de Orden Directo (V4/query/order-detail - POST) ...');
        const endpoint = '/spot/v4/query/order-detail';
        
        const requestBody = { symbol: SYMBOL, orderId: ORDEN_ID };
        
        const response = await makeRequest('POST', endpoint, {}, requestBody);
        
        // La respuesta es { code: 1000, data: { ... } }
        const orderDetails = response.data; 

        if (orderDetails && orderDetails.orderId) {
            console.log(`✅ TEST 4: ¡Consulta de Detalle EXITOSA!`);
            console.log(`ID: ${orderDetails.orderId}, Estado: ${orderDetails.state}, Lado: ${orderDetails.side}`);
            return orderDetails;
        } else {
            console.log('❌ TEST 4: La consulta funcionó (Code 1000), pero la API devolvió un objeto de orden vacío o la orden no se encontró en ese endpoint.');
            return null;
        }
    } catch (error) {
        console.error(`❌ TEST 4: Fallo al consultar el Detalle de la Orden.`);
        console.error('Mensaje de error:', error.message);
        return null;
    }
}


// --------------------------------------------------------------------------
// Función principal de Ejecución (Incluye TEST 4)
// --------------------------------------------------------------------------

async function runApiTest() {
    console.log('--- Iniciando Prueba de Funciones (BALANCE, HISTORIAL V4, DETALLE) ---');
    
    await testBalance();
    const allOrders = await testHistoryOrders();
    await testOrderDetail(allOrders);
    await testOrderDetailDirect(); // EJECUTAR EL NUEVO TEST
}

// Ejecutar la prueba
runApiTest();