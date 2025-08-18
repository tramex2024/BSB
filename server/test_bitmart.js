// TEST HISTORY ORDERS v4
const axios = require('axios');
const CryptoJS = require('crypto-js');

// ===========================================================================
// *** RECUERDA: REEMPLAZA ESTOS VALORES CON TUS CLAVES REALES DE BITMART ***
// ===========================================================================
const API_KEY = '596122f1e4d120dfb61e1ff1beb8d36e40b98425';    // <--- ¡REEMPLAZA ESTO!
const API_SECRET = 'b93546823bd9087e5f360bcd63f037012921e0a5c9944bab8c5721199c8a5cca'; // <--- ¡REEMPLAZA ESTO!
const API_MEMO = 'GainBot';
// ===========================================================================

const BASE_URL = 'https://api-cloud.bitmart.com'; // URL base de la API de BitMart

/**
 * Genera la firma para la solicitud a la API de BitMart.
 * IMPORTANTE: Para POST, el 'body' en la firma es el JSON string del cuerpo de la solicitud.
 * @param {string} timestamp - Timestamp actual en milisegundos.
 * @param {string} body - Cuerpo de la solicitud (JSON string) o cadena vacía para GET.
 * @returns {string} - Firma HMAC SHA256.
 */
function generateSign(timestamp, body) {
  const message = timestamp + '#' + API_MEMO + '#' + body;
  return CryptoJS.HmacSHA256(message, API_SECRET).toString(CryptoJS.enc.Hex);
}

/**
 * Obtiene la lista de órdenes spot históricas (completadas, canceladas, etc.)
 * usando el endpoint v4 POST.
 * @param {object} options - Objeto con opciones de filtrado.
 * @param {string} [options.symbol] - Símbolo del par de trading, ej: "BTC_USDT". Opcional.
 * @param {string} [options.orderMode] - Modo de orden: "spot" o "iso_margin". Opcional.
 * @param {number} [options.startTime] - Marca de tiempo de inicio en milisegundos (Unix). Opcional.
 * @param {number} [options.endTime] - Marca de tiempo de fin en milisegundos (Unix). Opcional.
 * @param {number} [options.limit] - Número de órdenes a devolver, rango [1,200], default 200. Opcional.
 * @returns {Promise<object[]>} - Promesa que resuelve con un array de órdenes o un error.
 */
async function getHistoryOrdersV4(options = {}) {
  console.log(`\n--- Paso Final 4: Listando Historial de Órdenes (V4 POST) ---`);
  const timestamp = Date.now().toString();
  const path = '/spot/v4/query/history-orders'; // ¡Endpoint confirmado!

  // El cuerpo de la solicitud para POST
  const requestBody = {
    recvWindow: 5000 // default: 5000 milliseconds
  };

  // Añadir parámetros al requestBody solo si están presentes en las opciones
  if (options.symbol) {
    requestBody.symbol = options.symbol;
  }
  if (options.orderMode) {
    requestBody.orderMode = options.orderMode;
  }
  if (options.startTime) {
    requestBody.startTime = options.startTime;
  }
  if (options.endTime) {
    requestBody.endTime = options.endTime;
  }
  if (options.limit) {
    requestBody.limit = options.limit;
  }

  // El 'body' para la firma es el JSON string del requestBody
  const bodyForSign = JSON.stringify(requestBody);

  const sign = generateSign(timestamp, bodyForSign);

  const url = `${BASE_URL}${path}`; // No hay parámetros de consulta en la URL para POST

  const headers = {
    'Content-Type': 'application/json',
    'X-BM-KEY': API_KEY,
    'X-BM-TIMESTAMP': timestamp,
    'X-BM-SIGN': sign,
  };

  console.log('Solicitud URL:', url);
  console.log('Solicitud Body (para la API):', requestBody);
  console.log('Body para la firma:', bodyForSign);
  console.log('Cabeceras (Parcial):', {
    'X-BM-KEY': headers['X-BM-KEY'].substring(0, 8) + '...',
    'X-BM-TIMESTAMP': headers['X-BM-TIMESTAMP'],
    'X-BM-SIGN': headers['X-BM-SIGN'].substring(0, 8) + '...'
  });

  try {
    const response = await axios.post(url, requestBody, { headers });

    if (response.data.message === 'success' || response.data.code === 1000) {
      let orders = [];
      if (Array.isArray(response.data.data)) { // A veces 'data' es directamente un array
        orders = response.data.data;
      } else if (response.data.data && Array.isArray(response.data.data.list)) { // A veces 'data' tiene una propiedad 'list'
        orders = response.data.data.list;
      }

      if (orders.length > 0) {
        console.log(`✅ ¡Historial de órdenes obtenido! Se encontraron ${orders.length} órdenes.`);
        // Imprime solo las primeras 5 órdenes para no saturar la terminal
        orders.slice(0, 5).forEach((order, index) => {
          console.log(`\n--- Orden Histórica ${index + 1} ---`);
          console.log(JSON.stringify(order, null, 2));
        });
        if (orders.length > 5) {
          console.log(`...y ${orders.length - 5} órdenes más.`);
        }
      } else {
        console.log('ℹ️ No se encontraron órdenes en el historial con los criterios especificados (o no tienes historial en ese rango).');
        // Muestra la respuesta completa para depuración si no se encuentran órdenes
        console.log("Respuesta completa si no se encuentran órdenes:", JSON.stringify(response.data, null, 2));
      }
      return orders;
    } else {
      console.error('❌ Error en la respuesta de la API de BitMart al obtener historial V4:', response.data);
      throw new Error(`Error de BitMart API: ${response.data.message} (Code: ${response.data.code})`);
    }
  } catch (error) {
    console.error('\n❌ Falló la obtención del historial de órdenes spot V4.');
    if (error.response) {
      console.error('Error Data:', error.response.data);
      console.error('Error Status:', error.response.status);
      console.error('Error Headers:', error.response.headers);
    } else if (error.request) {
      console.error('Error Request: No se recibió respuesta. ¿Problema de red o firewall?');
    } else {
      console.error('Error Message:', error.message);
    }
    console.error('Configuración del Error:', error.config);
    throw error;
  }
}

// --- Ejecutando el Paso Final 4 ---
(async () => {
  // Verificación para asegurar que las claves API han sido reemplazadas
  if (API_KEY === 'TU_API_KEY' || API_SECRET === 'TU_API_SECRET' || API_MEMO === 'TU_MEMO') {
    console.error("ERROR: Por favor, reemplaza tus credenciales API reales antes de ejecutar este script.");
    return;
  }

  try {
    const now = Date.now();
    // Establecer un rango de tiempo amplio para asegurarnos de capturar historial
    // Por ejemplo, los últimos 90 días (90 * 24 * 60 * 60 * 1000 milisegundos)
    const ninetyDaysAgo = now - (90 * 24 * 60 * 60 * 1000);

    // Puedes ajustar estos parámetros para filtrar tu historial.
    // Si quieres todas las órdenes históricas sin filtrar por símbolo, elimina 'symbol'.
    await getHistoryOrdersV4({
      // symbol: 'BTC_USDT', // Descomenta y especifica un símbolo si quieres filtrar
      orderMode: 'spot',     // 'spot' o 'iso_margin'
      startTime: ninetyDaysAgo, // Desde hace 90 días
      endTime: now,           // Hasta ahora
      limit: 100              // Cantidad máxima de órdenes por llamada (máx 200)
    });

  } catch (error) {
    // El error ya se maneja y se imprime dentro de la función getHistoryOrdersV4
  }
})();

// --- Exportamos la función de prueba para que server.js la pueda llamar ---
async function runTest() {
    console.log("Iniciando prueba de historial de órdenes...");
    const now = Date.now();
    const ninetyDaysAgo = now - (90 * 24 * 60 * 60 * 1000);

    await getHistoryOrdersV4({
      orderMode: 'spot',
      startTime: ninetyDaysAgo,
      endTime: now,
      limit: 100
    });
}

// Exportar la función para que el otro archivo pueda usarla
module.exports = {
    runTest
};