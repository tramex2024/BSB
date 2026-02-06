// BSB/server/services/bitmartService.js

const axios = require('axios');
const CryptoJS = require('crypto-js');
const { initOrderWebSocket } = require('./bitmartWs');

const BASE_URL = 'https://api-cloud.bitmart.com';
const LOG_PREFIX = '[BITMART_SERVICE]';

// =========================================================================
// MOTOR DE FIRMA, CACHÉ Y PETICIONES
// =========================================================================
const cache = {
    ticker: { data: null, timestamp: 0, promise: null },
    klines: { data: null, timestamp: 0, promise: null }
};
const CACHE_TTL = 2000; 
const KLINES_TTL = 15000;

async function makeRequest(method, path, params = {}, body = {}) {
    const { BITMART_API_KEY, BITMART_SECRET_KEY, BITMART_API_MEMO } = process.env;
    const timestamp = Date.now().toString();

    let bodyForSign = method === 'POST' ? JSON.stringify(body) : '';
    const message = `${timestamp}#${BITMART_API_MEMO}#${bodyForSign}`;
    const sign = CryptoJS.HmacSHA256(message, BITMART_SECRET_KEY).toString(CryptoJS.enc.Hex);

    const headers = {
        'Content-Type': 'application/json',
        'X-BM-KEY': BITMART_API_KEY,
        'X-BM-TIMESTAMP': timestamp,
        'X-BM-SIGN': sign,
    };

    try {
        const config = { method, url: `${BASE_URL}${path}`, headers, timeout: 10000 };
        if (method === 'GET') config.params = params;
        else config.data = body;

        const response = await axios(config);
        if (response.data.code === 1000) return response.data;
        throw new Error(`API Error: ${response.data.message} (${response.data.code})`);
    } catch (error) {
        if (error.response?.status === 429) throw new Error("RATE_LIMIT_EXCEEDED");
        throw new Error(`BitMart Request Failed [${path}]: ${error.message}`);
    }
}

// =========================================================================
// LÓGICA DE NEGOCIO
// =========================================================================
const orderStatusMap = { 'filled': 1, 'cancelled': 6, 'all': 0 };

const bitmartService = {
    validateApiKeys: async () => {
        try {
            await bitmartService.getBalance();
            console.log(`${LOG_PREFIX} ✅ Credenciales validadas.`);
            return true;
        } catch (e) { return false; }
    },

    getBalance: async () => {
        const res = await makeRequest('GET', '/account/v1/wallet');
        return res.data.wallet;
    },

    getAvailableTradingBalances: async () => {
        try {
            const wallet = await bitmartService.getBalance();
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
        if (cache.ticker.promise) return cache.ticker.promise;
        if (cache.ticker.data && (now - cache.ticker.timestamp < CACHE_TTL)) return cache.ticker.data;

        cache.ticker.promise = (async () => {
            try {
                const res = await makeRequest('GET', '/spot/v1/ticker', { symbol });
                const data = res.data.tickers.find(t => t.symbol === symbol);
                cache.ticker.data = data;
                cache.ticker.timestamp = Date.now();
                return data;
            } finally { cache.ticker.promise = null; }
        })();
        return cache.ticker.promise;
    },

    getKlines: async (symbol, interval, limit = 200) => {
        const now = Date.now();
        if (cache.klines.promise) return cache.klines.promise;
        if (cache.klines.data && (now - cache.klines.timestamp < KLINES_TTL)) return cache.klines.data;

        cache.klines.promise = (async () => {
            try {
                const res = await makeRequest('GET', '/spot/quotation/v3/klines', { symbol, step: interval, size: limit });
                const data = res.data.map(c => ({
                    timestamp: parseInt(c[0]), open: parseFloat(c[1]), high: parseFloat(c[2]), low: parseFloat(c[3]), close: parseFloat(c[4]), volume: parseFloat(c[5])
                }));
                cache.klines.data = data;
                cache.klines.timestamp = Date.now();
                return data;
            } finally { cache.klines.promise = null; }
        })();
        return cache.klines.promise;
    },

    getOpenOrders: async (symbol) => {
        const res = await makeRequest('POST', '/spot/v4/query/open-orders', {}, { symbol, limit: 100 });
        const rawOrders = res.data?.data || res.data || [];
        console.log(`${LOG_PREFIX} [RENDER LOG] Abiertas encontradas: ${Array.isArray(rawOrders) ? rawOrders.length : 0}`);
        if (Array.isArray(rawOrders) && rawOrders.length > 0) {
            rawOrders.forEach((o, i) => {
                console.log(`🔍 [INSPECCIÓN ABIERTA #${i+1}] ID: ${o.orderId || o.order_id} | Side: ${o.side} | Status: ${o.state || o.status}`);
            });
        }
        return { orders: Array.isArray(rawOrders) ? rawOrders : [] };
    },

    // --- HISTORIAL CON LOG DE EMERGENCIA ---
    getHistoryOrders: async (options = {}) => {
        const requestBody = {
            symbol: options.symbol || 'BTC_USDT',
            orderMode: 'spot',
            limit: options.limit || 100
        };
        
        const status = options.order_state || options.status;
        if (status && status !== 'all') requestBody.status = orderStatusMap[status];

        console.log(`${LOG_PREFIX} 📡 Consultando Historial (${status || 'all'})...`);
        const res = await makeRequest('POST', '/spot/v4/query/history-orders', {}, requestBody);
        
        // Extraemos la lista buscando en todas las rutas posibles del JSON de BitMart
        const rawOrders = res.data?.data?.list || res.data?.list || res.data || [];
        
        console.log(`${LOG_PREFIX} [RENDER LOG] Historial Result: ${Array.isArray(rawOrders) ? rawOrders.length : 0} ítems.`);
        
        // ESTE ES EL LOG QUE BUSCAMOS:
        if (Array.isArray(rawOrders) && rawOrders.length > 0) {
            console.log(`🚀 [DETECCION DE ORDENES] Se detectaron ${rawOrders.length} órdenes en el historial.`);
            rawOrders.forEach((o, i) => {
                console.log(`📜 [HISTORIAL-DETALLE #${i+1}] ID: ${o.orderId || o.order_id} | Sym: ${o.symbol} | Side: ${o.side} | Status: ${o.status || o.state}`);
            });
        } else {
            console.log(`⚠️ [DETECCION] La API respondió con 0 órdenes para los parámetros enviados.`);
        }
        
        return (Array.isArray(rawOrders) ? rawOrders : []).map(o => ({
            ...o,
            price: parseFloat(o.priceAvg) > 0 ? o.priceAvg : o.price,
            size: parseFloat(o.filledSize) > 0 ? o.filledSize : o.size,
            orderTime: o.orderTime || o.updateTime || o.createTime || Date.now()
        }));
    },

    getOrderDetail: async (symbol, orderId) => {
        try {
            const res = await makeRequest('POST', '/spot/v4/query/order', {}, { symbol, orderId: String(orderId), orderMode: 'spot' });
            return res.data?.data || null;
        } catch (e) { return null; }
    },

    placeOrder: async (symbol, side, type, amount, price) => {
        const sideLower = side.toLowerCase();
        const body = { symbol, side: sideLower, type: type.toLowerCase() };
        if (type.toLowerCase() === 'limit') {
            body.size = amount.toString();
            body.price = price.toString();
        } else {
            if (sideLower === 'buy') body.notional = amount.toString();
            else body.size = amount.toString();
        }
        const res = await makeRequest('POST', '/spot/v2/submit_order', {}, body);
        return res.data;
    },

    initOrderWebSocket,
    getRecentOrders: async (symbol) => bitmartService.getHistoryOrders({ symbol, limit: 100 }),
    placeMarketOrder: async ({ symbol, side, notional }) => 
        bitmartService.placeOrder(symbol, side, 'market', notional, null)
};

module.exports = bitmartService;