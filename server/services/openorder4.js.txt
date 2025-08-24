// TEST OPEN ORDERS v4
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
 * Obtiene la lista de órdenes spot abiertas usando el endpoint v4 POST.
 * Se ha simplificado para probar la funcionalidad básica.
 * @param {object} options - Objeto con opciones de filtrado.
 * @param {string} [options.symbol] - Símbolo del par de trading, ej: "BTC_USDT". Opcional.
 * @returns {Promise<object[]>} - Promesa que resuelve con un array de órdenes o un error.
 */
async function getOpenOrdersV4(options = {}) {
  console.log(`\n--- Paso Final 3: Listando Órdenes Abiertas (V4 POST) - Intento Simplificado ---`);
  const timestamp = Date.now().toString();
  const path = '/spot/v4/query/open-orders'; // ¡Endpoint confirmado!

  // Cuerpo de la solicitud minimizado para la prueba
  const requestBody = {
    // recvWindow: 5000 // Puedes mantenerlo si quieres, la doc dice que es opcional y tiene default
  };

  // Si quieres probar con un símbolo específico, descomenta la línea de abajo
  // requestBody.symbol = options.symbol; // Solo si se pasó en las opciones.

  // El 'body' para la firma es el JSON string del requestBody
  // Es CRÍTICO que el JSON string sea exactamente el mismo que se envía en el cuerpo.
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
  console.log('Body para la firma:', bodyForSign); // Muestra el body real usado para la firma
  console.log('Cabeceras (Parcial):', {
    'X-BM-KEY': headers['X-BM-KEY'].substring(0, 8) + '...',
    'X-BM-TIMESTAMP': headers['X-BM-TIMESTAMP'],
    'X-BM-SIGN': headers['X-BM-SIGN'].substring(0, 8) + '...'
  });

  try {
    const response = await axios.post(url, requestBody, { headers });

    // La API de BitMart suele devolver un objeto { code: 1000, message: 'success', data: {...} }
    // En el caso de listas, `data` a veces contiene `list: [...]`
    if (response.data.message === 'success' || response.data.code === 1000) {
      // Intentamos obtener la lista de órdenes. BitMart puede devolverla directamente en 'data'
      // o dentro de 'data.list'. Si 'data' es un array, lo tomamos directamente.
      // Si 'data' es un objeto y tiene una propiedad 'list' que es un array, tomamos esa.
      let orders = [];
      if (Array.isArray(response.data.data)) {
        orders = response.data.data;
      } else if (response.data.data && Array.isArray(response.data.data.list)) {
        orders = response.data.data.list;
      }

      if (orders.length > 0) {
        console.log(`✅ ¡Órdenes Abiertas obtenidas! Se encontraron ${orders.length} órdenes.`);
        // Imprime solo las primeras 5 órdenes para no saturar la terminal
        orders.slice(0, 5).forEach((order, index) => {
          console.log(`\n--- Orden Abierta ${index + 1} ---`);
          console.log(JSON.stringify(order, null, 2));
        });
        if (orders.length > 5) {
          console.log(`...y ${orders.length - 5} órdenes más.`);
        }
      } else {
        console.log('ℹ️ La API respondió exitosamente, pero no se encontraron órdenes abiertas con los criterios especificados (o no tienes órdenes abiertas actualmente).');
        // Esto es CLAVE: si no encuentra órdenes, muestra la respuesta completa para que podamos inspeccionar la estructura.
        console.log("Respuesta completa si no se encuentran órdenes:", JSON.stringify(response.data, null, 2));
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
      if (error.response.status === 404) {
          console.error("POSIBLE CAUSA: El endpoint '/spot/v4/query/open-orders' no es correcto o no existe para tu cuenta.");
          console.error("Verifica la documentación de BitMart V4 para el historial de órdenes abiertas y asegúrate de la URL exacta.");
      }
    } else if (error.request) {
      console.error('Error Request: No se recibió respuesta. ¿Problema de red o firewall?');
    } else {
      console.error('Error Message:', error.message);
    }
    console.error('Configuración del Error:', error.config);
    throw error;
  }
}

// --- Ejecutando el Paso Final 3 ---
(async () => {
  // Verificación para asegurar que las claves API han sido reemplazadas
  if (API_KEY === 'TU_API_KEY' || API_SECRET === 'TU_API_SECRET' || API_MEMO === 'TU_MEMO') {
    console.error("ERROR: Por favor, reemplaza tus credenciales API reales antes de ejecutar este script.");
    return;
  }

  try {
    // Probamos sin ningún parámetro de filtro (solo recvWindow si se mantiene en el body)
    // Esto es para asegurarnos de que la llamada base al endpoint funciona.
    await getOpenOrdersV4({});

    // Si después de la prueba anterior te funciona, puedes intentar filtrar:
    // await getOpenOrdersV4({ symbol: 'BTC_USDT' });
  } catch (error) {
    // El error ya se maneja y se imprime dentro de la función getOpenOrdersV4
  }
})();