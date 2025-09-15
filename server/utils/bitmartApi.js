// BSB/server/utils/bitmartApi.js

const axios = require('axios');

const BITMART_API_BASE_URL = 'https://api-cloud.bitmart.com';

/**
 * Obtiene el precio del último trade de un par de trading desde la API de BitMart.
 * @param {string} symbol - El par de trading (ej. 'BTC_USDT').
 * @returns {Promise<number|null>} El precio del último trade como un número, o null si falla.
 */
async function getTickerPrice(symbol) {
    try {
        const response = await axios.get(`${BITMART_API_BASE_URL}/spot/v1/ticker?symbol=${symbol}`);
        
        if (response.data && response.data.code === 1000 && response.data.data.tickers && response.data.data.tickers.length > 0) {
            const ticker = response.data.data.tickers[0];
            return parseFloat(ticker.last_price);
        }

        console.error(`[BitMart API] No se pudo obtener el precio para el símbolo ${symbol}. Respuesta:`, response.data);
        return null;

    } catch (error) {
        console.error(`[BitMart API] Error al conectar con la API de BitMart:`, error.message);
        return null;
    }
}

module.exports = {
    getTickerPrice
};