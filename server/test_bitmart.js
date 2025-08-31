// Archivo: BSB/server/services/test_bitmart.js

const axios = require('axios');
const CryptoJS = require('crypto-js');
const bitmartService = require('./services/bitmartService');

// Las claves serán pasadas como argumento, no se leen aquí

let API_KEY, API_SECRET, API_MEMO;

const BASE_URL = 'https://api-cloud.bitmart.com';

function generateSign(timestamp, body) {
  // Los logs de verificación se añaden antes de esta línea para ver los valores
  const message = timestamp + '#' + API_MEMO + '#' + body;
  return CryptoJS.HmacSHA256(message, API_SECRET).toString(CryptoJS.enc.Hex);

}

async function getHistoryOrdersV4(options = {}) {
  console.log(`\n--- Paso Final 4: Listando Historial de Órdenes (V4 POST) ---`);
  const timestamp = Date.now().toString();
  const path = '/spot/v4/query/history-orders';
  const requestBody = { recvWindow: 5000 };

  if (options.symbol) { requestBody.symbol = options.symbol; }
  if (options.orderMode) { requestBody.orderMode = options.orderMode; }
  if (options.startTime) { requestBody.startTime = options.startTime; }
  if (options.endTime) { requestBody.endTime = options.endTime; }
  if (options.limit) { requestBody.limit = options.limit; }

  const bodyForSign = JSON.stringify(requestBody);
  const sign = generateSign(timestamp, bodyForSign);
  const url = `${BASE_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    'X-BM-KEY': API_KEY,
    'X-BM-TIMESTAMP': timestamp,
    'X-BM-SIGN': sign,
  };
  try {
    const response = await axios.post(url, requestBody, { headers });
    if (response.data.code === 1000) {
      const orders = Array.isArray(response.data.data) ? response.data.data : (response.data.data && Array.isArray(response.data.data.list) ? response.data.data.list : []);
      if (orders.length > 0) {
        console.log(`✅ ¡Historial de órdenes obtenido! Se encontraron ${orders.length} órdenes.`);
        orders.slice(0, 5).forEach((order, index) => console.log(`\n--- Orden Histórica ${index + 1} ---`, JSON.stringify(order, null, 2)));
        if (orders.length > 5) console.log(`...y ${orders.length - 5} órdenes más.`);
      } else {
        console.log('ℹ️ No se encontraron órdenes en el historial.');
      }
      return orders;
    } else {
      throw new Error(`Error de BitMart API: ${response.data.message} (Code: ${response.data.code})`);
    }
  } catch (error) {
    console.error('\n❌ Falló la obtención del historial de órdenes spot V4.');
    console.error('Error:', error.response ? error.response.data : error.message);
    throw error;
  }
}

async function getOpenOrdersTest(credentials) {
    console.log(`\n--- Paso 5: Listando Órdenes Abiertas (V4 POST) ---`);
    try {
        const openOrdersResult = await bitmartService.getOpenOrders(credentials, 'BTC_USDT');
        if (openOrdersResult.orders.length > 0) {
            console.log(`✅ ¡Órdenes Abiertas obtenidas! Se encontraron ${openOrdersResult.orders.length} órdenes.`);
            openOrdersResult.orders.forEach((order, index) => {
                console.log(`--- Orden Abierta ${index + 1} ---`);
                console.log(`  ID: ${order.order_id}`);
                console.log(`  Símbolo: ${order.symbol}`);
                console.log(`  Estado: ${order.state}`);
                console.log(`  Lado: ${order.side}`);
                console.log(`  Precio: ${order.price}`);
                console.log(`  Tamaño: ${order.size}`);
            });
        } else {
            console.log('ℹ️ No se encontraron órdenes abiertas.');
        }
        return openOrdersResult.orders;
    } catch (error) {
        console.error('\n❌ Falló la obtención de órdenes abiertas.');
        console.error('Error:', error.message);
        throw error;
    }
}

async function runTest(credentials) {
  if (!credentials || !credentials.apiKey || !credentials.secretKey) {
    console.error("ERROR: Las credenciales API no se pasaron a la función de prueba.");
    return;
  }

  API_KEY = credentials.apiKey;
  API_SECRET = credentials.secretKey;
  API_MEMO = credentials.memo || "GainBot";

  // --- NUEVO BLOQUE DE CÓDIGO DE VERIFICACIÓN ---
  console.log("--- Verificando credenciales antes de la firma ---");
  console.log(`API Key: ${API_KEY ? '✅ Leída' : '❌ No leída'}`);
  console.log(`Secret Key: ${API_SECRET ? '✅ Leída' : '❌ No leída'}`);
  console.log(`API Memo: ${API_MEMO ? '✅ Leído' : '❌ No leído'}`);
  console.log("--- Fin de la verificación ---");
  // --- FIN DEL NUEVO BLOQUE ---

  console.log("Iniciando prueba de historial de órdenes...");
  const now = Date.now();
  const ninetyDaysAgo = now - (90 * 24 * 60 * 60 * 1000);
  try {
    await getOpenOrdersTest(credentials);    
    await getHistoryOrdersV4({
      orderMode: 'spot',
      startTime: ninetyDaysAgo,
      endTime: now,
      limit: 100
    });
  } catch (error) {
    // El error ya se maneja en getHistoryOrdersV4
  }
}

module.exports = {
  runTest
};