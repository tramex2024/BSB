const axios = require('axios');
const CryptoJS = require('crypto-js');
require('dotenv').config();

const API_KEY = process.env.BITMART_API_KEY;
const API_SECRET = process.env.BITMART_SECRET_KEY;
const API_MEMO = process.env.BITMART_API_MEMO;

const BASE_URL = 'https://api-cloud.bitmart.com';

function generateSign(timestamp, body) {
  const message = `${timestamp}#${API_MEMO}#${body}`;
  return CryptoJS.HmacSHA256(message, API_SECRET).toString(CryptoJS.enc.Hex);
}

async function getOpenOrdersV4(options = {}) {
  console.log(`\n--- Iniciando prueba de Órdenes Abiertas (V4 POST) ---`);
  
  if (!API_KEY || !API_SECRET || !API_MEMO) {
    console.error("ERROR: Las credenciales API no se cargaron desde .env.");
    return;
  }
  
  const timestamp = Date.now().toString();
  const path = '/spot/v4/query/open-orders';
  
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
    'X-BM-MEMO': API_MEMO
  };

  try {
    const response = await axios.post(url, requestBody, { headers });
    
    if (response.data.code === 1000) {
      const orders = Array.isArray(response.data.data) ? response.data.data : [];

      if (orders.length > 0) {
        console.log(`✅ ¡Órdenes Abiertas obtenidas! Se encontraron ${orders.length} órdenes.`);
        orders.forEach((order) => {
          console.log(JSON.stringify(order, null, 2));
        });
      } else {
        console.log('ℹ️ La API respondió exitosamente, pero no se encontraron órdenes abiertas.');
      }
      return orders;
    } else {
      console.error('❌ Error en la respuesta de la API:', response.data);
      throw new Error(`Error de BitMart API: ${response.data.message} (Code: ${response.data.code})`);
    }
  } catch (error) {
    console.error('\n❌ Falló la obtención de órdenes abiertas V4.');
    if (error.response) {
      console.error('Error de la API:', error.response.data);
    } else {
      console.error('Error de red:', error.message);
    }
    throw error;
  }
}