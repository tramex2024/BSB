// Archivo: test_bitmart.js

const axios = require('axios');
const CryptoJS = require('crypto-js');
require('dotenv').config(); // Carga las variables de entorno

const API_KEY = process.env.BITMART_API_KEY;
const API_SECRET = process.env.BITMART_SECRET_KEY;
const API_MEMO = process.env.BITMART_API_MEMO || "GainBot";

const BASE_URL = 'https://api-cloud.bitmart.com'; // URL base de la API de BitMart

/**
 * Genera la firma para la solicitud a la API de BitMart.
 * @param {string} timestamp - Timestamp actual en milisegundos.
 * @param {string} body - Cuerpo de la solicitud (JSON string) o cadena vacía para GET.
 * @returns {string} - Firma HMAC SHA256.
 */
function generateSign(timestamp, body) {
  const message = timestamp + '#' + API_MEMO + '#' + body;
  return CryptoJS.HmacSHA256(message, API_SECRET).toString(CryptoJS.enc.Hex);
}

/**
 * Obtiene la lista de órdenes spot históricas.
 * @param {object} options - Objeto con opciones de filtrado.
 */
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

    if (response.data.message === 'success' || response.data.code === 1000) {
      let orders = Array.isArray(response.data.data) ? response.data.data : (response.data.data && Array.isArray(response.data.data.list) ? response.data.data.list : []);
      
      if (orders.length > 0) {
        console.log(`✅ ¡Historial de órdenes obtenido! Se encontraron ${orders.length} órdenes.`);
        orders.slice(0, 5).forEach((order, index) => {
          console.log(`\n--- Orden Histórica ${index + 1} ---`);
          console.log(JSON.stringify(order, null, 2));
        });
        if (orders.length > 5) {
          console.log(`...y ${orders.length - 5} órdenes más.`);
        }
      } else {
        console.log('ℹ️ No se encontraron órdenes en el historial.');
      }
      return orders;
    } else {
      throw new Error(`Error de BitMart API: ${response.data.message} (Code: ${response.data.code})`);
    }
  } catch (error) {
    console.error('\n❌ Falló la obtención del historial de órdenes spot V4.');
    if (error.response) {
      console.error('Error Data:', error.response.data);
    } else {
      console.error('Error Message:', error.message);
    }
    throw error;
  }
}

// Exportamos la función de prueba para que server.js la pueda llamar
async function runTest() {
  if (!API_KEY || !API_SECRET) {
    console.error("ERROR: Las claves API no están configuradas en las variables de entorno.");
    return;
  }

  console.log("Iniciando prueba de historial de órdenes...");
  const now = Date.now();
  const ninetyDaysAgo = now - (90 * 24 * 60 * 60 * 1000);

  try {
    await getHistoryOrdersV4({
      orderMode: 'spot',
      startTime: ninetyDaysAgo,
      endTime: now,
      limit: 100
    });
  } catch (error) {
    // El error ya se maneja y se imprime dentro de la función getHistoryOrdersV4
  }
}

// Exportar la función
module.exports = {
  runTest
};