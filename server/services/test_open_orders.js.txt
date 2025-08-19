// TEST OPEN ORDERS v4

const axios = require('axios');
const CryptoJS = require('crypto-js');
require('dotenv').config();

// ===========================================================================
// *** Las claves se leen desde el archivo .env ***
// ===========================================================================
const API_KEY = process.env.BITMART_API_KEY;
const API_SECRET = process.env.BITMART_SECRET_KEY;
const API_MEMO = process.env.BITMART_API_MEMO;
// ===========================================================================

const BASE_URL = 'https://api-cloud.bitmart.com';

function generateSign(timestamp, body) {
  const message = timestamp + '#' + API_MEMO + '#' + body;
  console.log(`[DEBUG] Cadena a firmar (Open Orders): ${message}`);
  return CryptoJS.HmacSHA256(message, API_SECRET).toString(CryptoJS.enc.Hex);
}

async function getOpenOrdersV4(options = {}) {
  console.log(`\n--- Iniciando prueba de Órdenes Abiertas (V4 POST) ---`);
  
  // --- VERIFICACIÓN DE CREDENCIALES ---
  console.log("--- Verificando credenciales antes de la firma ---");
  console.log(`API Key: ${API_KEY ? '✅ Leída' : '❌ No leída'}`);
  console.log(`Secret Key: ${API_SECRET ? '✅ Leída' : '❌ No leída'}`);
  console.log(`API Memo: ${API_MEMO ? '✅ Leído' : '❌ No leído'}`);
  console.log("--- Fin de la verificación ---");
  
  const timestamp = Date.now().toString();
  const path = '/spot/v4/query/open-orders';
  
  // Cuerpo de la solicitud, con opción de incluir el símbolo
  const requestBody = {};
  if (options.symbol) {
    requestBody.symbol = options.symbol;
  }
  
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
      let orders = response.data.data && Array.isArray(response.data.data.list) ? response.data.data.list : [];

      if (orders.length > 0) {
        console.log(`✅ ¡Órdenes Abiertas obtenidas! Se encontraron ${orders.length} órdenes.`);
        orders.slice(0, 5).forEach((order, index) => {
          console.log(`\n--- Orden Abierta ${index + 1} ---`);
          console.log(JSON.stringify(order, null, 2));
        });
        if (orders.length > 5) {
          console.log(`...y ${orders.length - 5} órdenes más.`);
        }
      } else {
        console.log('ℹ️ La API respondió exitosamente, pero no se encontraron órdenes abiertas.');
      }
      return orders;
    } else {
      console.error('❌ Error en la respuesta de la API de BitMart al obtener órdenes abiertas V4:', response.data);
      throw new Error(`Error de BitMart API: ${response.data.message} (Code: ${response.data.code})`);
    }
  } catch (error) {
    console.error('\n❌ Falló la obtención de órdenes abiertas V4.');
    if (error.response) {
      console.error('Error Data:', error.response.data);
      console.error('Error Status:', error.response.status);
      console.error('Error Headers:', error.response.headers);
    } else {
      console.error('Error Message:', error.message);
    }
    throw error;
  }
}

// --- Ejecución de la prueba ---
(async () => {
  if (!API_KEY || !API_SECRET || !API_MEMO) {
    console.error("ERROR: Las credenciales API no se cargaron desde .env. Asegúrate de que el archivo .env esté en la raíz y contenga BITMART_API_KEY, BITMART_SECRET_KEY y BITMART_API_MEMO.");
    return;
  }
  try {
    await getOpenOrdersV4({ symbol: 'BTC_USDT' });
  } catch (error) {
    // El error ya se maneja en getOpenOrdersV4
  }
})();