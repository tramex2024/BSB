// Archivo: BSB/server/services/bitmartClient.js

const axios = require('axios');
const CryptoJS = require('crypto-js');

const BASE_URL = 'https://api-cloud.bitmart.com';

/**
 * Función centralizada para realizar solicitudes a la API de BitMart.
 * @param {string} method - Método HTTP (e.g., 'GET', 'POST').
 * @param {string} path - Ruta del endpoint de la API (e.g., '/spot/v4/wallet').
 * @param {object} params - Parámetros de la URL para solicitudes GET.
 * @param {object} body - Cuerpo de la solicitud para peticiones POST.
 * @returns {Promise<object>} - La respuesta de la API.
 */
async function makeRequest(method, path, params = {}, body = {}) {
    // Las credenciales se obtienen del entorno (dotenv) o del contexto de la aplicación.
    const { BITMART_API_KEY, BITMART_SECRET_KEY, BITMART_API_MEMO } = process.env;

    const credentials = {
        apiKey: BITMART_API_KEY,
        secretKey: BITMART_SECRET_KEY,
        memo: BITMART_API_MEMO,
    };
    
    // Verificación de credenciales
    if (!credentials.apiKey || !credentials.secretKey || !credentials.memo) {
        throw new Error("Las credenciales de la API no están configuradas.");
    }

    const timestamp = Date.now().toString();
    const url = `${BASE_URL}${path}`;

    let bodyForSign = '';
    let requestUrl = url;

    // La lógica de firma varía según el método HTTP.
    if (method === 'GET') {
        if (Object.keys(params).length > 0) {
            const queryString = new URLSearchParams(params).toString();
            requestUrl = `${url}?${queryString}`;
        }
        // Para solicitudes GET, el cuerpo para la firma es una cadena vacía.
        bodyForSign = '';
    } else if (method === 'POST') {
        // Para POST, el cuerpo para la firma es el JSON del body.
        bodyForSign = JSON.stringify(body);
    }
    
    // Generación de la firma de seguridad
    const message = timestamp + '#' + credentials.memo + '#' + bodyForSign;
    const sign = CryptoJS.HmacSHA256(message, credentials.secretKey).toString(CryptoJS.enc.Hex);

    const headers = {
        'Content-Type': 'application/json',
        'X-BM-KEY': credentials.apiKey,
        'X-BM-TIMESTAMP': timestamp,
        'X-BM-SIGN': sign,
    };

    try {
        const response = await axios({
            method,
            url: requestUrl,
            headers,
            data: body,
            params: method === 'GET' ? params : undefined,
        });

        if (response.data.code === 1000) {
            return response.data;
        } else {
            throw new Error(`Error de la API: ${response.data.message} (Code: ${response.data.code})`);
        }
    } catch (error) {
        throw new Error(`Falló la solicitud a BitMart en ${path}: ${error.response ? error.response.data.message : error.message}`);
    }
}

module.exports = {
    makeRequest,
};
