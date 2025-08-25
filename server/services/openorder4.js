// TEST OPEN ORDERS v4
const axios = require('axios');
const CryptoJS = require('crypto-js');
require('dotenv').config(); 

// ===========================================================================
// *** Las claves se cargan desde el archivo .env por seguridad ***
// ===========================================================================
const API_KEY = process.env.BITMART_API_KEY;
const API_SECRET = process.env.BITMART_SECRET_KEY;
const API_MEMO = process.env.BITMART_API_MEMO;
// ===========================================================================

const BASE_URL = 'https://api-cloud.bitmart.com';

/**
 * Genera la firma para la solicitud a la API de BitMart.
 * @param {string} timestamp - Timestamp actual en milisegundos.
 * @param {string} body - Cuerpo de la solicitud (JSON string) o cadena de consulta.
 * @returns {string} - Firma HMAC SHA256.
 */
function generateSign(timestamp, body) {
  const message = `${timestamp}#${API_MEMO}#${body}`;
  return CryptoJS.HmacSHA256(message, API_SECRET).toString(CryptoJS.enc.Hex);
}

/**
 * Obtiene la lista de órdenes spot abiertas usando el endpoint v4 POST.
 * @param {object} options - Objeto con opciones de filtrado.
 * @param {string} [options.symbol] - Símbolo del par de trading, ej: "BTC_USDT". Opcional.
 */
async function getOpenOrdersV4(options = {}) {
  console.log(`\n--- Listando Órdenes Abiertas (V4 POST) ---`);
  const timestamp = Date.now().toString();
  const path = '/spot/v4/query/open-orders';
  const requestBody = { ...options };

  const bodyForSign = JSON.stringify(requestBody);
  const sign = generateSign(timestamp, bodyForSign);

  const url = `${BASE_URL}${path}`;

  const headers = {
    'Content-Type': 'application/json',
    'X-BM-KEY': API_KEY,
    'X-BM-TIMESTAMP': timestamp,
    'X-BM-SIGN': sign,
    'X-BM-MEMO': API_MEMO,
  };

  try {
    const response = await axios.post(url, requestBody, { headers });

    if (response.data.message === 'success' || response.data.code === 1000) {
      const orders = Array.isArray(response.data.data) ? response.data.data : [];

      if (orders.length > 0) {
        console.log(`✅ ¡Órdenes Abiertas obtenidas! Se encontraron ${orders.length} órdenes.`);
        console.log(`\n--- Detalles de la primera orden abierta ---`);
        console.log(JSON.stringify(orders[0], null, 2));
      } else {
        console.log('ℹ️ La API respondió exitosamente, pero no se encontraron órdenes abiertas.');
      }
      return orders;
    } else {
      console.error('❌ Error en la API:', response.data);
      throw new Error(response.data.message || 'Unknown error');
    }
  } catch (error) {
    console.error('\n❌ Falló la obtención de órdenes abiertas.');
    if (error.response) {
      console.error('Error Data:', error.response.data);
    }
    throw error;
  }
}

(async () => {
  if (!API_KEY || !API_SECRET || !API_MEMO) {
    console.error("ERROR: Por favor, asegúrate de haber creado el archivo .env con tus credenciales.");
    return;
  }
  try {
    await getOpenOrdersV4({ symbol: 'BTC_USDT' });
  } catch (error) {
    // El error ya se maneja dentro de la función, no se necesita acción adicional aquí.
  }
})();