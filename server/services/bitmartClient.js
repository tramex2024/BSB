// Archivo: src/server/services/bitmartClient.js

const axios = require('axios');
const CryptoJS = require('crypto-js');
const querystring = require('querystring');
require('dotenv').config();

const API_URL = 'https://api-cloud.bitmart.com';
const USER_AGENT = 'GainBot-CustomClient';
const RETRY_ERROR_CODES = [30000];

/**
 * Genera la firma para la solicitud a la API de BitMart.
 * @param {string} timestamp - Timestamp actual en milisegundos.
 * @param {string} memo - El memo de la API.
 * @param {string} bodyOrQueryString - El cuerpo de la solicitud (JSON string) para POST o el query string ordenado para GET.
 * @param {string} apiSecret - La clave secreta de la API.
 * @returns {string} - Firma HMAC SHA256.
 */
function generateSignature(timestamp, memo, bodyOrQueryString, apiSecret) {
    const message = `${timestamp}#${memo}#${bodyOrQueryString || ''}`;
    return CryptoJS.HmacSHA256(message, apiSecret).toString(CryptoJS.enc.Hex);
}

const makeRequest = async (credentials, method, endpoint, params = {}, body = {}) => {
    const isPrivate = credentials && credentials.apiKey && credentials.secretKey;
    const headers = { 'User-Agent': USER_AGENT };
    let signatureBody = '';
    let requestData = body; // Por defecto, enviamos el objeto 'body'

    if (method.toUpperCase() === 'POST' && Object.keys(body).length > 0) {
        // Para POST, el body de la firma debe ser el JSON string del cuerpo.
        signatureBody = JSON.stringify(body);
        headers['Content-Type'] = 'application/json';
        requestData = body;
    } else if (method.toUpperCase() === 'GET' && Object.keys(params).length > 0) {
        // Para GET, el body de la firma debe ser el query string ordenado.
        const sortedParams = Object.keys(params).sort().reduce((acc, key) => {
            acc[key] = params[key];
            return acc;
        }, {});
        signatureBody = querystring.stringify(sortedParams);
        requestData = null; // No hay 'body' para una petición GET
    } else if (method.toUpperCase() === 'POST' && Object.keys(body).length === 0) {
        // Para peticiones POST sin cuerpo (como getOpenOrders V4), la firma usa un string vacío.
        signatureBody = '';
        headers['Content-Type'] = 'application/json';
        requestData = body;
    }
    
    if (isPrivate) {
        const timestamp = Date.now().toString();
        const memo = credentials.memo || '';
        const signature = generateSignature(
            timestamp,
            memo,
            signatureBody,
            credentials.secretKey
        );
        headers['X-BM-KEY'] = credentials.apiKey;
        headers['X-BM-SIGN'] = signature;
        headers['X-BM-TIMESTAMP'] = timestamp;
        headers['X-BM-MEMO'] = memo;
    }

    try {
        const response = await axios({
            method,
            url: `${API_URL}${endpoint}`,
            headers,
            data: requestData,
            params,
        });

        if (response.data.code !== 1000) {
            throw new Error(`API Error ${response.data.code}: ${response.data.message || 'Unknown error'}`);
        }

        return response.data;
    } catch (error) {
        const message = error.response?.data?.message || error.message;
        const code = error.response?.data?.code;
        const finalMessage = `Falló la solicitud a BitMart en ${endpoint}: ${message}`;

        console.error(`Error en la solicitud a ${endpoint}:`, finalMessage);

        const customError = new Error(finalMessage);
        customError.isRetryable = RETRY_ERROR_CODES.includes(code);
        
        throw customError;
    }
};

module.exports = {
    makeRequest,
    API_URL
};