/**
 * BSB/server/services/bitmartService.js
 * SERVICIO REST BITMART - Versión 2026 Reparada (Fix 401)
 */

const axios = require('axios');
const CryptoJS = require('crypto-js');
const querystring = require('querystring');
const { initOrderWebSocket } = require('./bitmartWs'); 

const BASE_URL = 'https://api-cloud.bitmart.com';
const LOG_PREFIX = '[BITMART_SERVICE]';

// Motores de caché
const tickerCache = new Map(); 
const CACHE_TTL = 2000;  

async function makeRequest(method, path, params = {}, body = {}, userCreds = null) {
    // 1. Extracción y Normalización de Credenciales
    const apiKey = (userCreds?.apiKey || process.env.BITMART_API_KEY || "").trim();
    const secretKey = (userCreds?.secretKey || process.env.BITMART_SECRET_KEY || "").trim();
    const apiMemo = (userCreds?.apiMemo || userCreds?.memo || process.env.BITMART_API_MEMO || "").trim();

    if (!apiKey || !secretKey) {
        throw new Error("Credenciales de BitMart faltantes.");
    }

    const timestamp = Date.now().toString();

    // 2. Preparación del String para la Firma
    let bodyOrQuery = "";
    if (method === 'GET') {
        bodyOrQuery = Object.keys(params).length > 0 ? querystring.stringify(params) : "";
    } else {
        bodyOrQuery = (body && Object.keys(body).length > 0) ? JSON.stringify(body) : "";
    }

    // 3. Generación de Firma HMAC SHA256
    const message = `${timestamp}#${apiMemo}#${bodyOrQuery}`;
    const sign = CryptoJS.HmacSHA256(message, secretKey).toString();

    // 4. Configuración de Headers
    const headers = {
        'Content-Type': 'application/json',
        'X-BM-KEY': apiKey,
        'X-BM-TIMESTAMP': timestamp,
        'X-BM-SIGN': sign,
        'X-BM-MEMO': apiMemo,
        'User-Agent': 'GainBot_V2_2026'
    };

    try {
        const config = { 
            method, 
            url: `${BASE_URL}${path}`, 
            headers, 
            timeout: 10000 
        };

        if (method === 'GET') {
            config.params = params;
        } else {
            config.data = bodyOrQuery; 
        }

        const response = await axios(config);
        
        if (response.data.code === 1000 || response.data.message === 'OK') {
            return response.data;
        }
        
        throw new Error(`BitMart Error: ${response.data.message} (Code: ${response.data.code})`);

    } catch (error) {
        // Solo dejamos el log de error 401 para diagnóstico rápido si las llaves caducan
        if (error.response?.status === 401) {
            console.error(`[BITMART] ❌ Error 401 en ${path}. Verifica las API Keys del usuario.`);
        }
        throw new Error(`BitMart Request Failed [${path}]: ${error.response?.data?.message || error.message}`);
    }
}

// =========================================================================
// LÓGICA DE NEGOCIO
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

   // --- Órdenes (Escritura) ---
    placeOrder: async (symbol, side, type, amount, price, creds) => {
        const sideLower = side.toLowerCase();
        const body = { symbol, side: sideLower, type: type.toLowerCase() };

        // Función interna para evitar decimales infinitos que rompen la firma
        const cleanNum = (n, precision = 8) => {
            const num = parseFloat(n);
            // Si es USDT (notional), máximo 2 decimales. Si es BTC (size), hasta 8.
            const p = (sideLower === 'buy' && type.toLowerCase() === 'market') ? 2 : precision;
            return num.toFixed(p).replace(/\.?0+$/, ""); // Quita ceros innecesarios al final
        };

        if (type.toLowerCase() === 'limit') {
            body.size = cleanNum(amount);
            body.price = cleanNum(price, 2);
        } else {
            // Lógica de mercado
            if (sideLower === 'buy') body.notional = cleanNum(amount, 2); // <--- FIX AQUÍ
            else body.size = cleanNum(amount);
        }

        return await makeRequest('POST', '/spot/v2/submit_order', {}, body, creds);
    },

    placeMarketOrder: async (params, creds) => {
        const { symbol, side, notional, size } = params;
        const amount = side.toLowerCase() === 'buy' ? notional : size;
        return bitmartService.placeOrder(symbol, side, 'market', amount, null, creds);
    },

    getOpenOrders: async (symbol, creds) => {
        const safeSymbol = symbol || 'BTC_USDT';
        try {
            const res = await makeRequest('POST', '/spot/v4/query/open-orders', {}, { symbol: safeSymbol, limit: 100 }, creds);
            const orders = res.data?.list || res.data?.data?.list || [];
            return { orders: Array.isArray(orders) ? orders : [] };
        } catch (error) {
            return { orders: [] };
        }
    },

    getHistoryOrders: async (options = {}, creds) => {
        const symbol = options.symbol || 'BTC_USDT';
        const requestBody = { symbol, orderMode: 'spot', limit: options.limit || 50 };
        const statusStr = options.order_state || options.status;
        
        if (statusStr && statusStr !== 'all') {
            const statusCode = orderStatusMap[statusStr];
            if (statusCode !== undefined) requestBody.status = statusCode;
        }
        
        const res = await makeRequest('POST', '/spot/v4/query/history-orders', {}, requestBody, creds);
        let rawOrders = res.data?.list || res.data?.data?.list || [];
        
        return (Array.isArray(rawOrders) ? rawOrders : []).map(o => ({
            ...o,
            price: parseFloat(o.priceAvg) > 0 ? o.priceAvg : o.price,
            size: parseFloat(o.filledSize) > 0 ? o.filledSize : o.size,
            orderTime: o.orderTime || o.updateTime || o.createTime || Date.now()
        }));
    },

    getOrderDetail: async (symbol, orderId, creds) => {
        try {
            const res = await makeRequest('POST', '/spot/v4/query/order', {}, { 
                symbol, orderId: String(orderId), orderMode: 'spot' 
            }, creds);
            return res.data?.data || res.data || null;
        } catch (e) { return null; }
    },

    getTicker: async (symbol) => {
        const now = Date.now();
        const cached = tickerCache.get(symbol);
        if (cached?.data && (now - cached.timestamp < CACHE_TTL)) return cached.data;

        try {
            const res = await makeRequest('GET', '/spot/v1/ticker', { symbol });
            const data = res.data.tickers.find(t => t.symbol === symbol);
            tickerCache.set(symbol, { data, timestamp: Date.now() });
            return data;
        } catch (err) {
            throw err;
        }
    },

    getKlines: async (symbol, interval, limit = 200) => {
        try {
            const res = await makeRequest('GET', '/spot/quotation/v3/klines', { symbol, step: interval, size: limit });
            return res.data.map(c => ({
                timestamp: parseInt(c[0]),
                open: parseFloat(c[1]),
                high: parseFloat(c[2]),
                low: parseFloat(c[3]),
                close: parseFloat(c[4]),
                volume: parseFloat(c[5])
            }));
        } catch (e) { return []; }
    },

    initOrderWebSocket,
    getRecentOrders: async (symbol, creds) => bitmartService.getHistoryOrders({ symbol, limit: 50 }, creds)
};

module.exports = bitmartService;