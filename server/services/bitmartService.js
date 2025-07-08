// server/services/bitmartService.js 

const axios = require('axios');
const CryptoJS = require('crypto-js');
const querystring = require('querystring');

const BASE_URL = 'https://api-cloud.bitmart.com';

const DEFAULT_V4_POST_MEMO = 'GainBot'; // Memo predeterminado para peticiones POST a la API v4 si el usuario no proporciona uno

/**
 * Ordena recursivamente las claves de un objeto alfabéticamente.
 * Necesario para la generación de la firma de BitMart.
 * @param {object} obj El objeto a ordenar.
 * @returns {object} El objeto con las claves ordenadas.
 */
function sortObjectKeys(obj) {
    if (typeof obj !== 'object' || obj === null) {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => sortObjectKeys(item));
    }

    const sortedKeys = Object.keys(obj).sort();
    const sortedObj = {};
    for (const key of sortedKeys) {
        sortedObj[key] = sortObjectKeys(obj[key]);
    }
    return sortedObj;
}

/**
 * Genera la firma HMAC-SHA256 para la autenticación de BitMart.
 * La estructura del mensaje a firmar varía según si se incluye un memo y la versión de la API.
 * @param {string} timestamp El timestamp de la solicitud en milisegundos.
 * @param {string | null | undefined} memo El valor del memo para la solicitud (puede ser null/undefined para API v2).
 * @param {string} bodyOrQueryString La cadena JSON stringificada (para POST) o la cadena de consulta URL-encoded (para GET).
 * @param {string} apiSecret La clave secreta de tu API de BitMart.
 * @returns {string} La firma hexadecimal.
 */
function generateSign(timestamp, memo, bodyOrQueryString, apiSecret) {
    // Si memo es null, undefined o cadena vacía, se usa una cadena vacía para la construcción del mensaje.
    const memoForHash = (memo === null || memo === undefined || memo === '') ? '' : String(memo);
    const finalBodyOrQueryString = bodyOrQueryString || ''; // Asegura que no sea null/undefined

    let message;
    if (memoForHash === '') {
        // Formato de firma para API v2 y API v4 sin memo (o memo vacío)
        message = timestamp + '#' + finalBodyOrQueryString;
    } else {
        // Formato de firma para API v4 con memo
        message = timestamp + '#' + memoForHash + '#' + finalBodyOrQueryString;
    }

    console.log(`[SIGN_DEBUG] Timestamp para Firma: '${timestamp}'`);
    console.log(`[SIGN_DEBUG] Memo para Firma: '${memoForHash}' (Original: ${memo === null ? 'null' : memo === undefined ? 'undefined' : `'${memo}'`})`);
    console.log(`[SIGN_DEBUG] Cuerpo/Query String para Firma: '${finalBodyOrQueryString}' (Longitud: ${finalBodyOrQueryString.length})`);
    console.log(`[SIGN_DEBUG] Mensaje COMPLETO a Hashear: '${message}' (Longitud: ${message.length})`);
    // Oculta parte de la clave secreta por seguridad en los logs
    console.log(`[SIGN_DEBUG] API Secret (parcial): ${apiSecret.substring(0, 5)}...${apiSecret.substring(apiSecret.length - 5)} (Longitud: ${apiSecret.length})`);

    return CryptoJS.HmacSHA256(message, apiSecret).toString(CryptoJS.enc.Hex);
}

/**
 * Realiza una solicitud HTTP a la API de BitMart.
 * Maneja la construcción de URLs, parámetros, cuerpos de solicitud y la generación de la firma.
 * @param {string} method El método HTTP (GET, POST).
 * @param {string} path La ruta del endpoint de la API (ej. '/spot/v2/submit_order').
 * @param {object} [paramsOrData={}] Los parámetros de consulta para GET o el cuerpo de datos para POST.
 * @param {boolean} [isPrivate=true] Indica si la solicitud requiere autenticación (firma).
 * @param {object} [authCredentials={}] Objeto con apiKey, secretKey y apiMemo del usuario.
 * @param {string} [timestampOverride] Opcional: Un timestamp específico para usar (ej. hora del servidor).
 * @returns {Promise<object>} Los datos de respuesta de la API.
 * @throws {Error} Si la solicitud falla o la respuesta es inesperada.
 */
async function makeRequest(method, path, paramsOrData = {}, isPrivate = true, authCredentials = {}, timestampOverride) {
    // Usar el timestamp proporcionado o generar uno nuevo si no se proporciona
    const timestamp = timestampOverride || Date.now().toString();
    const url = `${BASE_URL}${path}`;
    let bodyForSign = ''; // Esto contendrá el JSON stringificado o el query string para la firma
    let requestConfig = {
        headers: {
            'User-Agent': 'axios/1.9.0', // Agente de usuario estándar
            'Accept': 'application/json, text/plain, */*' // Tipos de contenido aceptados
        },
        timeout: 15000 // Tiempo de espera de la solicitud en milisegundos
    };

    const { apiKey, secretKey, apiMemo } = authCredentials;

    // Determina si es un endpoint de la API v4.
    const isV4Endpoint = path.includes('/v4/');

    // Memo que se usará para la firma y el encabezado X-BM-MEMO.
    // Para API v2, este debe ser null o ''. Para API v4, debe ser un valor.
    let memoForSignAndHeader = null;

    if (isV4Endpoint) {
        // Para endpoints v4, el memo es parte de la firma y el encabezado.
        // Si el usuario no proporciona un memo para v4, usamos el predeterminado.
        memoForSignAndHeader = apiMemo || DEFAULT_V4_POST_MEMO;
        if (!apiMemo) {
             console.warn(`[API_MEMO_WORKAROUND] Usando memo predeterminado '${DEFAULT_V4_POST_MEMO}' para solicitud V4 '${path}' ya que el memo del usuario está en blanco.`);
        }
    }
    // Para endpoints V2, 'memoForSignAndHeader' permanecerá 'null', lo que lo excluirá de la firma y el encabezado X-BM-MEMO.


    const dataForRequest = { ...paramsOrData }; // Copia los parámetros/datos para no modificar el original

    if (isPrivate) {
        // RecvWindow es un parámetro de seguridad para solicitudes privadas.
        requestConfig.headers['X-BM-RECVWINDOW'] = 10000;
    }

    if (method === 'GET') {
        if (isPrivate) {
            dataForRequest.recvWindow = 10000;
        }
        // Para GET, ordenamos los parámetros y los convertimos a cadena de consulta.
        requestConfig.params = sortObjectKeys(dataForRequest);
        bodyForSign = querystring.stringify(requestConfig.params);
    } else if (method === 'POST') {
        // IMPORTANTE: Ordenar el objeto de datos ANTES de stringificarlo para la firma.
        const sortedDataForSign = sortObjectKeys(dataForRequest);
        bodyForSign = JSON.stringify(sortedDataForSign, null, 0); // Modificado para eliminar espacios y formateo

        // Los datos enviados en el cuerpo de la solicitud (sin ordenar, o podrías ordenar también si BitMart lo exigiera para el cuerpo real)
        requestConfig.data = dataForRequest;
        requestConfig.headers['Content-Type'] = 'application/json';
    }

    if (isPrivate) {
        // Verificación de credenciales de API. Para V4, el memo es requerido.
        if (!apiKey || !secretKey || (isV4Endpoint && (apiMemo === undefined || apiMemo === null || apiMemo === ''))) {
            throw new Error(`Credenciales de BitMart API (API Key, Secret${isV4Endpoint ? ', Memo' : ''}) no proporcionadas para una solicitud privada. Asegúrate de que el usuario haya configurado sus claves.`);
        }

        // Genera la firma usando el memo adecuado para la versión de la API
        const sign = generateSign(timestamp, memoForSignAndHeader, bodyForSign, secretKey);

        // Agrega los encabezados de autenticación
        requestConfig.headers['X-BM-KEY'] = apiKey;
        requestConfig.headers['X-BM-TIMESTAMP'] = timestamp;
        requestConfig.headers['X-BM-SIGN'] = sign;

        // Agrega el encabezado X-BM-MEMO SOLO si es una solicitud V4 y el memo tiene un valor.
        if (isV4Endpoint && memoForSignAndHeader !== null && memoForSignAndHeader !== '') {
            requestConfig.headers['X-BM-MEMO'] = memoForSignAndHeader;
        } else {
            // Asegura que X-BM-MEMO NO se envíe para solicitudes V2 o cuando el memo está vacío.
            delete requestConfig.headers['X-BM-MEMO'];
        }
    }

    console.log(`\n--- Realizando solicitud ${method} a ${path} ---`);
    console.log(`URL: ${url}`);
    if (method === 'POST') {
        console.log('Body enviado (para solicitud):', JSON.stringify(requestConfig.data));
        console.log('Body para Firma (JSON stringificado, ORDENADO):', bodyForSign); // Muestra el cuerpo ordenado para depuración
    } else {
        console.log('Query Params (para solicitud y firma, ordenados):', JSON.stringify(requestConfig.params));
    }
    console.log('Headers enviados:', JSON.stringify(requestConfig.headers, null, 2));

    try {
        const response = await axios({
            method: method,
            url: url,
            ...requestConfig // Pasa la configuración de la solicitud, incluyendo headers y data/params
        });

        // BitMart usa código 1000 para éxito
        if (response.data && response.data.code === 1000) {
            return response.data;
        } else {
            // Manejo de errores de la API de BitMart
            console.error(`❌ Error en la respuesta de la API de BitMart para ${path}:`, JSON.stringify(response.data, null, 2));
            throw new Error(`Error de BitMart API: ${response.data.message || response.data.error_msg || 'Respuesta inesperada'} (Code: ${response.data.code || 'N/A'})`);
        }
    } catch (error) {
        console.error(`\n❌ Falló la solicitud a ${path}.`);
        if (error.response) {
            // Error de respuesta del servidor (HTTP status code no 2xx)
            console.error('Error Data:', JSON.stringify(error.response.data, null, 2));
            console.error('Error Status:', error.response.status);
            console.error('Error Headers:', error.response.headers);
            throw new Error(`Error de la API de BitMart: ${JSON.stringify(error.response.data)} (Status: ${error.response.status})`);
        } else if (error.request) {
            // La solicitud fue hecha pero no se recibió respuesta (ej. red, firewall)
            console.error('Error Request: No se recibió respuesta. ¿Problema de red o firewall?');
            throw new Error('No se recibió respuesta de BitMart API. Posible problema de red, firewall o la API no está disponible.');
        } else {
            // Otros errores (ej. configuración de Axios, lógica de código)
            console.error('Error Message:', error.message);
            throw new Error(`Error desconocido al procesar la solicitud: ${error.message}`);
        }
    }
}

/**
 * Obtiene la hora actual del servidor de BitMart (endpoint público).
 * Es fundamental para asegurar la sincronización de los timestamps en las solicitudes firmadas.
 * @returns {Promise<string>} El timestamp del servidor en milisegundos como cadena.
 * @throws {Error} Si no se puede obtener la hora del servidor.
 */
async function getSystemTime() {
    console.log('\n--- Obteniendo Hora del Servidor BitMart (Público) ---');
    try {
        const response = await makeRequest('GET', '/system/time', {}, false); // Es una solicitud pública
        if (response && response.code === 1000 && response.data && response.data.server_time) {
            const serverTime = response.data.server_time.toString();
            console.log(`✅ Hora del servidor BitMart obtenida: ${serverTime} (${new Date(parseInt(serverTime)).toISOString()})`);
            return serverTime;
        } else {
            const errorMessage = response.message || response.error_msg || 'Respuesta inesperada';
            console.error(`❌ Respuesta inesperada al obtener la hora del servidor:`, JSON.stringify(response, null, 2));
            throw new Error(`Respuesta inesperada de BitMart al obtener hora del servidor: ${errorMessage}`);
        }
    } catch (error) {
        console.error(`❌ Error al obtener la hora del servidor de BitMart:`, error.message);
        throw error;
    }
}

/**
 * Obtiene el ticker de un símbolo específico.
 * @param {string} symbol El par de trading (ej. BTC_USDT).
 * @returns {Promise<object>} Los datos del ticker.
 * @throws {Error} Si falla la solicitud.
 */
async function getTicker(symbol) {
    try {
        const url = `/spot/quotation/v3/ticker`;
        const params = { symbol: symbol };
        console.log(`--- Solicitud GET Ticker para ${symbol} ---`);
        const response = await makeRequest('GET', url, params, false); // Es una solicitud pública
        if (response && response.code === 1000 && response.data) {
            console.log(`✅ Ticker para ${symbol} obtenido con éxito.`);
            return response.data;
        } else {
            console.error(`❌ Respuesta inesperada del ticker para ${symbol}:`, JSON.stringify(response, null, 2));
            throw new Error(`Respuesta inesperada del ticker de BitMart: ${JSON.stringify(response)}`);
        }
    } catch (error) {
        console.error(`❌ Falló la solicitud a getTicker para ${symbol}.`);
        throw error;
    }
}

/**
 * Obtiene el balance de la cuenta del usuario.
 * @param {object} authCredentials Contiene apiKey, secretKey, apiMemo.
 * @returns {Promise<Array<object>>} Array de objetos de balance.
 * @throws {Error} Si falla la solicitud o la respuesta es inesperada.
 */
async function getBalance(authCredentials) {
    console.log('\n--- Obteniendo Balance de la Cuenta ---');
    try {
        const serverTime = await getSystemTime(); // Obtener la hora del servidor para la firma
        // getBalance usa API v1, que no usa memo en la firma
        const response = await makeRequest('GET', '/account/v1/wallet', {}, true, authCredentials, serverTime);
        if (response && response.code === 1000 && response.data && response.data.wallet) {
            console.log('✅ Balance de la cuenta obtenido con éxito.', response.data.wallet);
            return response.data.wallet;
        } else {
            console.error('❌ Falló la obtención del balance de la cuenta. Respuesta inesperada:', JSON.stringify(response, null, 2));
            throw new Error(`Respuesta inesperada al obtener balance de BitMart: ${response.data.message || response.data.error_msg || JSON.stringify(response)}`);
        }
    }
    catch (error) {
        console.error('\n❌ Error al obtener balance de la cuenta:', error.message);
        throw error;
    }
}

/**
 * Obtiene las órdenes abiertas del usuario (endpoint V4 POST).
 * @param {object} authCredentials Contiene apiKey, secretKey, apiMemo.
 * @param {string} [symbol] Opcional: Filtra por símbolo.
 * @returns {Promise<{orders: Array<object>}>} Objeto con un array de órdenes.
 * @throws {Error} Si falla la solicitud.
 */
async function getOpenOrders(authCredentials, symbol) {
    console.log(`\n--- Obteniendo Órdenes Abiertas (V4 POST) para ${symbol || 'todos los símbolos'} ---`);
    const path = '/spot/v4/query/open-orders';
    const requestBody = {};
    if (symbol) { requestBody.symbol = symbol; } // Agrega el símbolo si se proporciona
    try {
        const serverTime = await getSystemTime();
        const response = await makeRequest('POST', path, requestBody, true, authCredentials, serverTime);
        const responseData = response.data;
        let orders = [];
        if (Array.isArray(responseData)) {
            orders = responseData;
        } else if (responseData && Array.isArray(responseData.list)) {
            orders = responseData.list;
        } else {
            console.warn('ℹ️ getOpenOrders: La API respondió exitosamente, pero el formato de las órdenes es inesperado.', JSON.stringify(responseData, null, 2));
        }
        if (orders.length > 0) {
            console.log(`✅ ¡Órdenes Abiertas obtenidas! Se encontraron ${orders.length} órdenes.`);
        } else {
            console.log('ℹ️ No se encontraron órdenes abiertas con los criterios especificados (o no tienes órdenes abiertas actualmente).');
            console.log("DEBUG: Respuesta completa si no se encuentran órdenes:", JSON.stringify(responseData, null, 2));
        }
        return { orders: orders }; // Devuelve el objeto con la propiedad 'orders' para consistencia
    } catch (error) {
        console.error('\n❌ Falló la obtención de órdenes abiertas V4.');
        throw error;
    }
}

/**
 * Obtiene el detalle de una orden específica (endpoint V4 POST).
 * @param {object} authCredentials Contiene apiKey, secretKey, apiMemo.
 * @param {string} symbol El par de trading.
 * @param {string} orderId El ID de la orden.
 * @returns {Promise<object>} Los detalles de la orden.
 * @throws {Error} Si falla la solicitud.
 */
async function getOrderDetail(authCredentials, symbol, orderId) {
    console.log(`\n--- Obteniendo Detalle de Orden ${orderId} para ${symbol} (V4 POST) ---`);
    const requestBody = { symbol: symbol, orderId: orderId };
    try {
        const serverTime = await getSystemTime();
        const response = await makeRequest('POST', '/spot/v4/query/order-detail', requestBody, true, authCredentials, serverTime);
        if (response && response.code === 1000 && response.data) {
            console.log(`✅ Detalle de orden ${orderId} obtenido con éxito.`);
            return response.data;
        } else {
            console.error(`❌ Falló la obtención del detalle de la orden. Respuesta inesperada:`, JSON.stringify(response, null, 2));
            throw new Error(`Respuesta inesperada al obtener detalle de orden de BitMart: ${JSON.stringify(response)}`);
        }
    } catch (error) {
        console.error('\n❌ Error al obtener el detalle de la orden:', error.message);
        throw error;
    }
}

/**
 * Coloca una nueva orden en BitMart.
 * @param {object} authCredentials Contiene apiKey, secretKey, apiMemo.
 * @param {string} symbol El par de trading (ej. BTC_USDT).
 * @param {'buy' | 'sell'} side La dirección de la orden.
 * @param {'limit' | 'market' | 'limit_maker' | 'ioc'} type El tipo de orden.
 * @param {string} size La cantidad de la orden. Para mercado compra, es 'notional' (monto); para mercado venta, es 'size' (cantidad).
 * @param {string} [price] El precio de la orden (solo para órdenes limit).
 * @returns {Promise<object>} Los datos de la orden colocada (incluye order_id).
 * @throws {Error} Si los parámetros son inválidos o falla la solicitud.
 */
async function placeOrder(authCredentials, symbol, side, type, size, price) {
    console.log(`[DEBUG_BITMART_SERVICE] placeOrder - symbol: ${symbol}, side: ${side}, type: ${type}, size: ${size}, price: ${price || 'N/A'}`);
    console.log(`\n--- Colocando Orden ${side.toUpperCase()} de ${size} ${symbol} (${type}) ---`);
    const requestBody = { symbol: symbol, side: side, type: type };

    // Construcción del cuerpo de la solicitud según el tipo de orden
    if (type === 'limit' || type === 'limit_maker' || type === 'ioc') {
        if (!price) { throw new Error("El precio es requerido para órdenes de tipo 'limit', 'limit_maker' o 'ioc'."); }
        requestBody.size = size.toString();
        requestBody.price = price.toString();
    } else if (type === 'market') {
        if (side === 'buy') {
            requestBody.notional = size.toString(); // Para órdenes de mercado de compra, se usa 'notional' (monto)
        } else if (side === 'sell') {
            requestBody.size = size.toString(); // Para órdenes de mercado de venta, se usa 'size' (cantidad)
        } else {
            throw new Error(`Tipo de orden no soportado para side: ${side} y type: ${type}`);
        }
    } else { throw new Error(`Tipo de orden no soportado: ${type}`); }

    console.log('DEBUG: requestBody antes de makeRequest:', requestBody);
    try {
        const serverTime = await getSystemTime(); // Obtener la hora del servidor para la firma
        // placeOrder usa API v2, que NO usa memo en la firma ni en el encabezado X-BM-MEMO.
        // makeRequest se encarga de esto internamente gracias a los cambios.
        const response = await makeRequest('POST', '/spot/v2/submit_order', requestBody, true, authCredentials, serverTime);
        if (response && response.code === 1000 && response.data) {
            console.log(`✅ Orden colocada con éxito:`, response.data);
            return response.data;
        } else {
            console.error(`❌ Falló la colocación de la orden. Respuesta inesperada:`, JSON.stringify(response, null, 2));
            throw new Error(`Respuesta inesperada al colocar orden de BitMart: ${response.data.message || response.data.error_msg || JSON.stringify(response)}`);
        }
    } catch (error) {
        console.error('\n❌ Error al colocar la orden:', error.message);
        throw error;
    }
}

/**
 * Cancela una orden específica.
 * @param {object} authCredentials Contiene apiKey, secretKey, apiMemo.
 * @param {string} symbol El par de trading.
 * @param {string} order_id El ID de la orden a cancelar.
 * @returns {Promise<object>} Los datos de la orden cancelada.
 * @throws {Error} Si falla la solicitud.
 */
async function cancelOrder(authCredentials, symbol, order_id) {
    console.log(`\n--- Cancelando Orden ${order_id} para ${symbol} ---`);
    const requestBody = { symbol: symbol, order_id: order_id }; // Nota: el campo es 'order_id'
    try {
        const serverTime = await getSystemTime();
        // cancelOrder usa API v2, que NO usa memo en la firma ni en el encabezado X-BM-MEMO.
        const response = await makeRequest('POST', '/spot/v2/cancel-order', requestBody, true, authCredentials, serverTime);
        if (response && response.code === 1000 && response.data) {
            console.log(`✅ Orden ${order_id} cancelada con éxito.`);
            return response.data;
        } else {
            console.error(`❌ Falló la cancelación de la orden. Respuesta inesperada:`, JSON.stringify(response, null, 2));
            throw new Error(`Respuesta inesperada al cancelar orden de BitMart: ${response.data.message || response.data.error_msg || JSON.stringify(response)}`);
        }
    } catch (error) {
        console.error('\n❌ Error al cancelar la orden:', error.message);
        throw error;
    }
}

/**
 * Obtiene el historial de órdenes del usuario (endpoint V4 POST).
 * @param {object} authCredentials Contiene apiKey, secretKey, apiMemo.
 * @param {object} [options={}] Opciones de filtro (symbol, orderMode, startTime, endTime, limit).
 * @returns {Promise<Array<object>>} Un array de órdenes históricas.
 * @throws {Error} Si falla la solicitud.
 */
async function getHistoryOrdersV4(authCredentials, options = {}) {
    console.log(`\n--- Listando Historial de Órdenes (V4 POST) ---`);
    const path = '/spot/v4/query/history-orders';
    const requestBody = {}; // Construye el cuerpo de la solicitud con las opciones proporcionadas
    if (options.symbol) { requestBody.symbol = options.symbol; }
    if (options.orderMode) { requestBody.orderMode = options.orderMode; }
    if (options.startTime) { requestBody.startTime = options.startTime; }
    if (options.endTime) { requestBody.endTime = options.endTime; }
    if (options.limit) { requestBody.limit = options.limit; }
    try {
        const serverTime = await getSystemTime();
        const response = await makeRequest('POST', path, requestBody, true, authCredentials, serverTime);
        const responseData = response.data;
        let orders = [];
        // La API de BitMart a veces devuelve el array directamente en 'data' y a veces lo anida en 'data.list'.
        if (Array.isArray(responseData)) {
            orders = responseData;
        } else if (responseData && Array.isArray(responseData.list)) {
            orders = responseData.list;
        } else {
            console.warn('ℹ️ getHistoryOrdersV4: La API respondió exitosamente, pero el formato de las órdenes es inesperado.', JSON.stringify(responseData, null, 2));
        }
        if (orders.length > 0) {
            console.log(`✅ ¡Historial de Órdenes obtenido! Se encontraron ${orders.length} órdenes.`);
        } else {
            console.log('ℹ️ No se encontraron órdenes en el historial con los criterios especificados.');
            console.log("DEBUG: Respuesta completa si no se encuentran órdenes:", JSON.stringify(responseData, null, 2));
        }
        return orders;
    } catch (error) {
        console.error('\n❌ Falló la obtención del historial de órdenes V4.');
        throw error;
    }
}

/**
 * Obtiene datos de Klines (velas) para un símbolo y un intervalo.
 * @param {string} symbol El par de trading.
 * @param {string} interval El intervalo de tiempo de las velas (ej. "1", "5", "15", "30", "60", "240", "480", "720", "1440").
 * @param {number} [limit=200] El número máximo de velas a devolver.
 * @returns {Promise<Array<object>>} Un array de objetos de velas.
 * @throws {Error} Si falla la solicitud.
 */
async function getKlines(symbol, interval, limit = 200) {
    console.log(`\n--- Solicitud GET Klines (Candlesticks) para ${symbol}, intervalo ${interval}, ${limit} velas ---`);
    const path = `/spot/quotation/v3/klines`;
    const params = { symbol: symbol, step: interval, size: limit };
    try {
        const response = await makeRequest('GET', path, params, false); // Es una solicitud pública
        if (response && response.code === 1000 && response.data) {
            console.log(`✅ Klines (Candlesticks) para ${symbol} obtenidos con éxito.`);
            // Mapea la respuesta raw de BitMart a un formato más legible
            const candles = response.data.map(c => ({
                timestamp: parseInt(c[0]), // Tiempo de apertura de la vela
                open: parseFloat(c[1]),    // Precio de apertura
                high: parseFloat(c[2]),    // Precio más alto
                low: parseFloat(c[3]),     // Precio más bajo
                close: parseFloat(c[4]),   // Precio de cierre
                volume: parseFloat(c[5])   // Volumen
            }));
            return candles;
        } else {
            console.error(`❌ Respuesta inesperada de klines (candlesticks) para ${symbol}:`, JSON.stringify(response, null, 2));
            throw new Error(`Respuesta inesperada de Klines (Candlesticks) de BitMart: ${JSON.stringify(response)}`);
        }
    } catch (error) {
        console.error(`❌ Falló la solicitud a getKlines para ${symbol}.`);
        throw error;
    }
}

/**
 * Valida las claves API de BitMart intentando obtener el balance de la cuenta.
 * @param {string} apiKey La clave API del usuario.
 * @param {string} secretKey La clave secreta del usuario.
 * @param {string} apiMemo El memo API del usuario (puede ser null/undefined para API v2).
 * @returns {Promise<boolean>} True si las credenciales son válidas, false en caso contrario.
 */
async function validateApiKeys(apiKey, secretKey, apiMemo) {
    console.log('\n--- Iniciando validación de credenciales API de BitMart ---');
    if (!apiKey || !secretKey) { // Memo puede ser opcional para algunos endpoints V2
        console.error("ERROR: API Key o Secret Key no proporcionados para validación.");
        return false;
    }

    try {
        // Intenta obtener el balance. Si tiene éxito, las claves son válidas.
        // getBalance usa una API v1 que no requiere memo para la firma.
        await getBalance({ apiKey, secretKey, apiMemo });
        console.log('✅ Credenciales API de BitMart validadas con éxito. CONECTADO.');
        return true;
    } catch (error) {
        console.error('❌ Falló la validación de credenciales API de BitMart:', error.message);
        return false;
    }
}

// Exporta las funciones para que puedan ser usadas por otros módulos.
module.exports = {
    getTicker,
    getBalance,
    getOpenOrders,
    getOrderDetail,
    placeOrder,
    cancelOrder,
    getHistoryOrdersV4,
    getKlines,
    validateApiKeys,
    getSystemTime, // Aunque es interna, puede ser útil para depuración o sincronización externa
};