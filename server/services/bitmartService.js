/**
 * BSB/server/services/bitmartService.js
 * SERVICIO REST BITMART - Versión 2026 Blindada con Sincronización V4
 */

const axios = require('axios');
const CryptoJS = require('crypto-js');
const querystring = require('querystring');

const BASE_URL = 'https://api-cloud.bitmart.com';
const LOG_PREFIX = '[BITMART_SERVICE]';
const DEFAULT_V4_POST_MEMO = 'GainBot';

// =========================================================================
// UTILIDADES DE FIRMA Y CACHÉ
// =========================================================================

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

const tickerCache = new Map(); 
const klinesCache = new Map(); 
const CACHE_TTL = 2000;  
const KLINES_TTL = 15000;

// =========================================================================
// MOTOR DE PETICIONES (makeRequest)
// =========================================================================

async function makeRequest(method, path, params = {}, body = {}, userCreds = null) {
    // Sincronización de tiempo (Usamos el reloj local, BitMart acepta un margen de 10s)
    const timestamp = Date.now().toString();
    const headers = {
        'Content-Type': 'application/json',
        'X-BM-TIMESTAMP': timestamp,
        'User-Agent': 'axios/1.9.0'
    };

    if (userCreds) {
        const { apiKey, secretKey, apiMemo } = userCreds;

        // Workaround para Memo en V4 POST
        let currentMemo = apiMemo;
        if (method === 'POST' && path.includes('/v4/') && (!currentMemo || currentMemo === "")) {
            currentMemo = DEFAULT_V4_POST_MEMO;
        }

        let bodyOrQuery = "";
        if (method === 'GET') {
            // Regla BitMart: Parámetros ordenados alfabéticamente en la Query String
            const sortedParams = sortObjectKeys(params);
            bodyOrQuery = querystring.stringify(sortedParams);
        } else if (method === 'POST') {
            // Regla BitMart V4: El body debe estar ordenado y si está vacío es ""
            const sortedBody = sortObjectKeys(body);
            bodyOrQuery = (sortedBody && Object.keys(sortedBody).length > 0) ? JSON.stringify(sortedBody) : "";
        }

        const memoForHash = (currentMemo === null || currentMemo === undefined) ? '' : String(currentMemo);
        
        // Construcción del mensaje: timestamp#memo#body
        const message = (memoForHash === '') 
            ? `${timestamp}#${bodyOrQuery}`
            : `${timestamp}#${memoForHash}#${bodyOrQuery}`;

        const sign = CryptoJS.HmacSHA256(message, secretKey).toString(CryptoJS.enc.Hex);

        headers['X-BM-KEY'] = apiKey;
        headers['X-BM-SIGN'] = sign;
        if (memoForHash !== '') headers['X-BM-MEMO'] = memoForHash;
    }

    try {
        const config = { 
            method, 
            url: `${BASE_URL}${path}`, 
            headers, 
            timeout: 10000 
        };

        if (method === 'GET') {
            config.params = sortObjectKeys(params);
        } else {
            config.data = sortObjectKeys(body);
        }

        const response = await axios(config);
        if (response.data.code === 1000) return response.data;

        throw new Error(`BitMart Error: ${response.data.message} (Code: ${response.data.code})`);

    } catch (error) {
        if (error.response?.status === 401) {
            console.error(`${LOG_PREFIX} ❌ ERROR 401: Firma rechazada en ${path}.`);
        }
        throw new Error(`BitMart Request Failed [${path}]: ${error.message}`);
    }
}

// =========================================================================
// LÓGICA DE NEGOCIO (Manteniendo tus funciones de BSB 2026)
// =========================================================================

const orderStatusMap = { 'filled': 1, 'cancelled': 6, 'all': 0 };

const bitmartService = {
    validateApiKeys: async (creds) => {
        try {
            const wallet = await bitmartService.getBalance(creds);
            return !!wallet;
        } catch (e) { return false; }
    },

    getBalance: async (creds) => {
        const res = await makeRequest('GET', '/account/v1/wallet', {}, {}, creds);
        return res.data.wallet;
    },

    getAvailableTradingBalances: async (creds) => {
        try {
            const wallet = await bitmartService.getBalance(creds);
            const usdt = wallet.find(b => b.currency === 'USDT');
            const btc = wallet.find(b => b.currency === 'BTC');
            return { 
                availableUSDT: parseFloat(usdt?.available || 0), 
                availableBTC: parseFloat(btc?.available || 0) 
            };
        } catch (e) { return { availableUSDT: 0, availableBTC: 0 }; }
    },

    getTicker: async (symbol) => {
        const now = Date.now();
        const cached = tickerCache.get(symbol);
        if (cached?.promise) return cached.promise;
        if (cached?.data && (now - cached.timestamp < CACHE_TTL)) return cached.data;

        const promise = (async () => {
            try {
                const res = await makeRequest('GET', '/spot/v1/ticker', { symbol });
                const data = res.data.tickers.find(t => t.symbol === symbol);
                tickerCache.set(symbol, { data, timestamp: Date.now(), promise: null });
                return data;
            } catch (err) {
                tickerCache.delete(symbol);
                throw err;
            }
        })();
        tickerCache.set(symbol, { ...cached, promise });
        return promise;
    },

    getKlines: async (symbol, interval, limit = 200) => {
        const now = Date.now();
        const cacheKey = `${symbol}_${interval}`;
        const cached = klinesCache.get(cacheKey);

        if (cached?.promise) return cached.promise;
        if (cached?.data && (now - cached.timestamp < KLINES_TTL)) return cached.data;

        const promise = (async () => {
            try {
                const res = await makeRequest('GET', '/spot/quotation/v3/klines', { symbol, step: interval, size: limit });
                const data = res.data.map(c => ({
                    timestamp: parseInt(c[0]), 
                    open: parseFloat(c[1]), 
                    high: parseFloat(c[2]), 
                    low: parseFloat(c[3]), 
                    close: parseFloat(c[4]), 
                    volume: parseFloat(c[5])
                }));
                klinesCache.set(cacheKey, { data, timestamp: Date.now(), promise: null });
                return data;
            } catch (err) {
                klinesCache.delete(cacheKey);
                throw err;
            }
        })();
        klinesCache.set(cacheKey, { ...cached, promise });
        return promise;
    },

    getOpenOrders: async (symbol, creds) => {
        const safeSymbol = symbol || 'BTC_USDT';
        const normalizedSymbol = safeSymbol.includes('_') ? safeSymbol : safeSymbol.replace('USDT', '_USDT');
        try {
            const res = await makeRequest('POST', '/spot/v4/query/open-orders', {}, { symbol: normalizedSymbol, limit: 100 }, creds);
            const orders = res.data?.list || res.data || [];
            return { orders: Array.isArray(orders) ? orders : [] };
        } catch (error) {
            console.error(`${LOG_PREFIX} Error en getOpenOrders:`, error.message);
            throw error;
        }
    },

    getHistoryOrders: async (options = {}, creds) => {
        const symbol = options.symbol || 'BTC_USDT';
        const normalizedSymbol = symbol.includes('_') ? symbol : symbol.replace('USDT', '_USDT');
        const requestBody = { symbol: normalizedSymbol, orderMode: 'spot', limit: options.limit || 100 };
        const statusStr = options.order_state || options.status;
        if (statusStr && statusStr !== 'all') {
            const statusCode = orderStatusMap[statusStr];
            if (statusCode !== undefined) requestBody.status = statusCode;
        }
        const res = await makeRequest('POST', '/spot/v4/query/history-orders', {}, requestBody, creds);
        let rawOrders = res.data?.list || res.data || [];
        return (Array.isArray(rawOrders) ? rawOrders : []).map(o => ({
            ...o,
            price: parseFloat(o.priceAvg) > 0 ? o.priceAvg : o.price,
            size: parseFloat(o.filledSize) > 0 ? o.filledSize : o.size,
            orderTime: o.orderTime || o.updateTime || o.createTime || Date.now()
        }));
    },

    placeOrder: async (symbol, side, type, amount, price, creds, clientOrderId = null) => {
        const sideLower = side.toLowerCase();
        const body = { symbol, side: sideLower, type: type.toLowerCase() };
        if (clientOrderId) body.clientOrderId = clientOrderId; 
        if (type.toLowerCase() === 'limit') {
            body.size = amount.toString();
            body.price = price.toString();
        } else {
            if (sideLower === 'buy') body.notional = amount.toString();
            else body.size = amount.toString();
        }
        const res = await makeRequest('POST', '/spot/v2/submit_order', {}, body, creds);
        return res.data;
    }
};

module.exports = bitmartService;