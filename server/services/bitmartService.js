// BSB/server/services/bitmartService.js

const axios = require('axios');
const CryptoJS = require('crypto-js');
const { initOrderWebSocket } = require('./bitmartWs');

const BASE_URL = 'https://api-cloud.bitmart.com';
const LOG_PREFIX = '[BITMART_SERVICE]';

// --- SISTEMA DE CACHÉ Y DEDUPLICACIÓN ---
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
        if (error.response?.status === 429) {
            throw new Error("RATE_LIMIT_EXCEEDED");
        }
        throw new Error(`BitMart Request Failed [${path}]: ${error.message}`);
    }
}

// CORRECCIÓN: BitMart v4 prefiere strings para el campo orderState
const orderStatusMap = { 'filled': '1', 'cancelled': '6', 'all': '0' };

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
        if (cache.ticker.data && (now - cache.ticker.timestamp < CACHE_TTL)) {
            return cache.ticker.data;
        }

        cache.ticker.promise = (async () => {
            try {
                const res = await makeRequest('GET', '/spot/v1/ticker', { symbol });
                const data = res.data.tickers.find(t => t.symbol === symbol);
                cache.ticker.data = data;
                cache.ticker.timestamp = Date.now();
                return data;
            } finally {
                cache.ticker.promise = null;
            }
        })();

        return cache.ticker.promise;
    },

    getKlines: async (symbol, interval, limit = 200) => {
        const now = Date.now();
        if (cache.klines.promise) return cache.klines.promise;
        if (cache.klines.data && (now - cache.klines.timestamp < KLINES_TTL)) {
            return cache.klines.data;
        }

        cache.klines.promise = (async () => {
            try {
                const res = await makeRequest('GET', '/spot/quotation/v3/klines', { 
                    symbol, step: interval, size: limit 
                });
                const data = res.data.map(c => ({
                    timestamp: parseInt(c[0]),
                    open: parseFloat(c[1]),
                    high: parseFloat(c[2]),
                    low: parseFloat(c[3]),
                    close: parseFloat(c[4]),
                    volume: parseFloat(c[5])
                }));
                cache.klines.data = data;
                cache.klines.timestamp = Date.now();
                return data;
            } finally {
                cache.klines.promise = null;
            }
        })();

        return cache.klines.promise;
    },

    getOpenOrders: async (symbol) => {
        const res = await makeRequest('POST', '/spot/v4/query/open-orders', {}, { symbol, limit: 100 });
        return { orders: res.data.data || res.data || [] };
    },

    getHistoryOrders: async (options = {}) => {
        const now = Date.now();
        const ninetyDaysAgo = now - (90 * 24 * 60 * 60 * 1000); // Rango de 90 días por defecto

        const requestBody = {
            symbol: options.symbol || 'BTC_USDT',
            orderMode: 'spot',
            limit: options.limit || 100,
            startTime: options.startTime || ninetyDaysAgo,
            endTime: options.endTime || now
        };

        const statusKey = options.order_state || options.status;
        
        // CORRECCIÓN CRÍTICA: BitMart v4 usa 'orderState', no 'status'
        if (statusKey && statusKey !== 'all') {
            requestBody.orderState = orderStatusMap[statusKey];
        }

        const res = await makeRequest('POST', '/spot/v4/query/history-orders', {}, requestBody);
        
        // CORRECCIÓN: Manejo flexible de la respuesta (res.data puede ser el array directo)
        const rawOrders = res.data?.list || (Array.isArray(res.data) ? res.data : []);
        
        return rawOrders.map(o => ({
            ...o,
            price: (o.priceAvg && parseFloat(o.priceAvg) > 0) ? o.priceAvg : o.price,
            size: (o.filledSize && parseFloat(o.filledSize) > 0) ? o.filledSize : o.size,
            updateTime: parseInt(o.updateTime || o.createTime || Date.now())
        }));
    },

    placeOrder: async (symbol, side, type, amount, price) => {
        const sideLower = side.toLowerCase();
        const body = { 
            symbol, 
            side: sideLower, 
            type: type.toLowerCase() 
        };

        if (type.toLowerCase() === 'limit') {
            body.size = amount.toString();
            body.price = price.toString();
        } else {
            if (sideLower === 'buy') body.notional = amount.toString();
            else if (sideLower === 'sell') body.size = amount.toString();
            else throw new Error(`Lado de orden no soportado: ${sideLower}`);
        }

        console.log(`${LOG_PREFIX} 📡 Enviando a BitMart:`, body);
        const res = await makeRequest('POST', '/spot/v2/submit_order', {}, body);
        return res.data;
    },

    // --- Helpers ---
    initOrderWebSocket,
    getRecentOrders: async (symbol) => bitmartService.getHistoryOrders({ symbol, limit: 50 }),
    placeMarketOrder: async ({ symbol, side, notional }) => 
        bitmartService.placeOrder(symbol, side, 'market', notional, null)
};

module.exports = bitmartService;