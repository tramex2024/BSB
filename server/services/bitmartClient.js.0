// Archivo: BSB/server/services/bitmartClient.js
const axios = require('axios');
const CryptoJS = require('crypto-js');

const BASE_URL = 'https://api-cloud.bitmart.com';

async function makeRequest(method, path, params = {}, body = {}) {
    const { BITMART_API_KEY, BITMART_SECRET_KEY, BITMART_API_MEMO } = process.env;

    const credentials = {
        apiKey: BITMART_API_KEY,
        secretKey: BITMART_SECRET_KEY,
        memo: BITMART_API_MEMO,
    };
    
    if (!credentials.apiKey || !credentials.secretKey || !credentials.memo) {
        throw new Error("Las credenciales de la API no están configuradas.");
    }

    const timestamp = Date.now().toString();

    let bodyForSign = '';
    let queryString = '';

    if (method === 'GET') {
        if (Object.keys(params).length > 0) {
            queryString = new URLSearchParams(params).toString();
        }
    } else if (method === 'POST') {
        bodyForSign = JSON.stringify(body);
    }
    
    const message = timestamp + '#' + credentials.memo + '#' + bodyForSign;
    const sign = CryptoJS.HmacSHA256(message, credentials.secretKey).toString(CryptoJS.enc.Hex);

    const headers = {
        'Content-Type': 'application/json',
        'X-BM-KEY': credentials.apiKey,
        'X-BM-TIMESTAMP': timestamp,
        'X-BM-SIGN': sign,
    };

    try {
        const config = {
            method,
            url: `${BASE_URL}${path}`,
            headers,
	    timeout: 10000,
        };

        if (method === 'GET') {
            config.params = params;
        } else if (method === 'POST') {
            config.data = body;
        }

        const response = await axios(config);

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