// Archivo: BSB/server/services/bitmartClient.js

const axios = require('axios');
const CryptoJS = require('crypto-js');
const querystring = require('querystring');
require('dotenv').config();

const API_URL = 'https://api-cloud.bitmart.com';
const USER_AGENT = 'GainBot-CustomClient';

function generateSignature(timestamp, memo, bodyForSign, apiSecret) {
    // La firma v4 de BitMart es estricta: timestamp#memo#body
    // El 'body' debe ser una cadena JSON, incluso si está vacía.
    const message = `${timestamp}#${memo || ''}#${bodyForSign}`;
    return CryptoJS.HmacSHA256(message, apiSecret).toString(CryptoJS.enc.Hex);
}

const makeRequest = async (credentials, method, endpoint, params = {}, body = {}) => {
    const isPrivate = credentials && credentials.apiKey && credentials.secretKey;
    const headers = { 'User-Agent': USER_AGENT };
    let signatureBody = '';

    if (method.toUpperCase() === 'POST') {
        // Para POST, el cuerpo de la firma es el JSON stringificado,
        // incluso si el objeto 'body' es vacío.
        signatureBody = JSON.stringify(body);
        headers['Content-Type'] = 'application/json';
    } else if (method.toUpperCase() === 'GET') {
        const sortedParams = Object.keys(params).sort().reduce((acc, key) => {
            acc[key] = params[key];
            return acc;
        }, {});
        signatureBody = querystring.stringify(sortedParams);
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
            data: body,
            params,
        });

        if (response.data.code !== 1000) {
            throw new Error(`API Error ${response.data.code}: ${response.data.message || 'Unknown error'}`);
        }
        
        return response.data;
    } catch (error) {
        const message = error.response?.data?.message || error.message;
        const finalMessage = `Falló la solicitud a BitMart en ${endpoint}: ${message}`;

        console.error(`Error en la solicitud a ${endpoint}:`, finalMessage);
        
        const customError = new Error(finalMessage);
        throw customError;
    }
};

module.exports = {
    makeRequest,
    API_URL
};