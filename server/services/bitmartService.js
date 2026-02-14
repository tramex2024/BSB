/**
 * BSB/server/services/bitmartService.js
 * SERVICIO REST BITMART - Versión 2026 Blindada
 */

const axios = require('axios');
const CryptoJS = require('crypto-js');

const BASE_URL = 'https://api-cloud.bitmart.com';
const LOG_PREFIX = '[BITMART_SERVICE]';

// --- UTILIDAD DE ORDENAMIENTO PARA FIRMA (Añadido para evitar 401) ---
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

// =========================================================================
// MOTOR DE FIRMA Y CACHÉ DINÁMICO
// =========================================================================
const tickerCache = new Map(); 
const klinesCache = new Map(); 

const CACHE_TTL = 2000;  
const KLINES_TTL = 15000;

async function makeRequest(method, path, params = {}, body = {}, userCreds = null) {
    const timestamp = Date.now().toString();
    const headers = {
        'Content-Type': 'application/json',
        'X-BM-TIMESTAMP': timestamp,
    };

    if (userCreds) {
        const { apiKey, secretKey, apiMemo } = userCreds;
        
        let bodyOrQuery = "";
        if (method === 'GET') {
            // Ordenar alfabéticamente para la firma de la Query String
            const sortedParams = sortObjectKeys(params);
            bodyOrQuery = new URLSearchParams(sortedParams).toString();
        } else if (method === 'POST') {
            // Ordenar alfabéticamente para la firma del Body JSON
            const sortedBody = sortObjectKeys(body);
            bodyOrQuery = (sortedBody && Object.keys(sortedBody).length > 0) ? JSON.stringify(sortedBody) : "";
        }

        const memoStr = apiMemo || "";
        const message = `${timestamp}#${memoStr}#${bodyOrQuery}`;
        const sign = CryptoJS.HmacSHA256(message, secretKey).toString(CryptoJS.enc.Hex);

        headers['X-BM-KEY'] = apiKey;
        headers['X-BM-SIGN'] = sign;
        if (apiMemo) headers['X-BM-MEMO'] = apiMemo;
    }

    try {
        const config = { 
            method, 
            url: `${BASE_URL}${path}`, 
            headers, 
            timeout: 10000 
        };

        // ENVIAR DATOS ORDENADOS: Crucial para que BitMart no rechace la firma
        if (method === 'GET') config.params = sortObjectKeys(params);
        else config.data = sortObjectKeys(body);

        const response = await axios(config);
        if (response.data.code === 1000) return response.data;

        throw new Error(`BitMart Error: ${response.data.message} (Code: ${response.data.code})`);

    } catch (error) {
        if (error.response?.status === 401) {
            console.error(`${LOG_PREFIX} ❌ ERROR 401: Firma rechazada en ${path}. Revisa el orden de parámetros.`);
        }
        throw new Error(`BitMart Request Failed [${path}]: ${error.message}`);
    }
}

// =========================================================================
// LÓGICA DE NEGOCIO (Mantenida 100% igual)
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
            const res = await makeRequest(
                'POST', 
                '/spot/v4/query/open-orders', 
                {}, 
                { symbol: normalizedSymbol, limit: 100 }, 
                creds
            );

            const orders = res.data?.list || res.data || [];
            return { orders: Array.isArray(orders) ? orders : [] };
        } catch (error) {
            console.error(`${LOG_PREFIX} Error en getOpenOrders para ${normalizedSymbol}:`, error.message);
            throw error;
        }
    },

    getHistoryOrders: async (options = {}, creds) => {
        const symbol = options.symbol || 'BTC_USDT';
        const normalizedSymbol = symbol.includes('_') ? symbol : symbol.replace('USDT', '_USDT');

        const requestBody = {
            symbol: normalizedSymbol,
            orderMode: 'spot',
            limit: options.limit || 100
        };
        
        const statusStr = options.order_state || options.status;
        if (statusStr && statusStr !== 'all') {
            const statusCode = orderStatusMap[statusStr];
            if (statusCode !== undefined) requestBody.status = statusCode;
        }

        const res = await makeRequest('POST', '/spot/v4/query/history-orders', {}, requestBody, creds);
        
        let rawOrders = res.data?.list || res.data || [];
        if (res.data?.data?.list) rawOrders = res.data.data.list;

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
    },

    placeMarketOrder: async ({ symbol, side, notional, size, clientOrderId }, creds) => {
        const amount = side.toLowerCase() === 'buy' ? notional : size;
        return bitmartService.placeOrder(symbol, side, 'market', amount, null, creds, clientOrderId);
    }
};

module.exports = bitmartService;