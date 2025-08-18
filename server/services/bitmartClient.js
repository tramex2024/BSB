// Archivo: src/server/services/bitmartClient.js

const axios = require('axios');
const CryptoJS = require('crypto-js');
const querystring = require('querystring');
require('dotenv').config();

const API_URL = 'https://api-cloud.bitmart.com';
const USER_AGENT = 'GainBot-CustomClient';
const RETRY_ERROR_CODES = [30000];

function sortObjectKeys(obj) {
    if (typeof obj !== 'object' || obj === null) return obj;
    if (Array.isArray(obj)) return obj.map(item => sortObjectKeys(item));
    const sortedKeys = Object.keys(obj).sort();
    const sortedObj = {};
    for (const key of sortedKeys) {
        sortedObj[key] = sortObjectKeys(obj[key]);
    }
    return sortedObj;
}

function generateSignature(timestamp, memo, bodyOrQueryString, apiSecret) {
    // La firma SIEMPRE debe incluir el body o el queryString, incluso si están vacíos
    const message = `${timestamp}#${memo || ''}#${bodyOrQueryString || ''}`;
    return CryptoJS.HmacSHA256(message, apiSecret).toString(CryptoJS.enc.Hex);
}

const makeRequest = async (credentials, method, endpoint, params = {}, body = {}) => {
    const isPrivate = credentials && credentials.apiKey && credentials.secretKey;
    const headers = { 'User-Agent': USER_AGENT };
    let requestData;
    let signatureBody;

    if (method.toUpperCase() === 'POST' && Object.keys(body).length > 0) {
        // Para POST, el body de la firma debe ser el JSON string del cuerpo.
        requestData = JSON.stringify(body);
        headers['Content-Type'] = 'application/json';
        signatureBody = requestData;
    } else if (method.toUpperCase() === 'GET' && Object.keys(params).length > 0) {
        // Para GET, el body de la firma debe ser el query string ordenado.
        const sortedParams = sortObjectKeys(params);
        signatureBody = querystring.stringify(sortedParams);
    } else {
        // Si no hay body ni params, el body de la firma es una cadena vacía.
        signatureBody = '';
    }

    if (isPrivate) {
        const timestamp = Date.now().toString();
        const memo = credentials.memo || 'GainBot';
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
        
        const isRetryableError = RETRY_ERROR_CODES.includes(code);
        
        const customError = new Error(finalMessage);
        customError.isRetryable = isRetryableError;
        
        throw customError;
    }
};

module.exports = {
    makeRequest,
    API_URL
};