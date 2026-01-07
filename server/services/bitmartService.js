// Archivo: BSB/server/services/bitmartService.js

const axios = require('axios');
const CryptoJS = require('crypto-js');
const { initOrderWebSocket } = require('./bitmartWs');

const BASE_URL = 'https://api-cloud.bitmart.com';
const LOG_PREFIX = '[BITMART_SERVICE]';

// =========================================================================
// MOTOR DE FIRMA Y PETICIONES (Antes en bitmartClient.js)
// =========================================================================
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
        throw new Error(`BitMart Request Failed [${path}]: ${error.message}`);
    }
}

// =========================================================================
// LÓGICA DE NEGOCIO (Antes en bitmartSpot.js)
// =========================================================================

const orderStatusMap = { 'filled': 1, 'cancelled': 6, 'all': 0 };

const bitmartService = {
    // --- Autenticación y Balances ---
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

    // --- Órdenes ---
    getOpenOrders: async (symbol) => {
        const res = await makeRequest('POST', '/spot/v4/query/open-orders', {}, { symbol, limit: 100 });
        return { orders: res.data.data || res.data || [] };
    },

    getHistoryOrders: async (options = {}) => {
        const requestBody = {
            symbol: options.symbol,
            orderMode: 'spot',
            limit: options.limit || 50
        };
        const status = options.order_state || options.status;
        if (status && status !== 'all') requestBody.status = orderStatusMap[status];

        const res = await makeRequest('POST', '/spot/v4/query/history-orders', {}, requestBody);
        const rawOrders = res.data?.data?.list || res.data || [];
        
        return rawOrders.map(o => ({
            ...o,
            price: parseFloat(o.priceAvg) > 0 ? o.priceAvg : o.price,
            size: parseFloat(o.filledSize) > 0 ? o.filledSize : o.size
        }));
    },

    getOrderDetail: async (symbol, orderId) => {
        try {
            const res = await makeRequest('POST', '/spot/v4/query/order', {}, { 
                symbol, orderId: String(orderId), orderMode: 'spot' 
            });
            return res.data?.data || null;
        } catch (e) { return null; }
    },

    /**
     * placeOrder: Versión Robusta
     * @param {string} symbol - Ejemplo: 'BTC_USDT'
     * @param {string} side - 'buy' o 'sell'
     * @param {string} type - 'limit' o 'market'
     * @param {number|string} amount - Cantidad (en BTC si es size, en USDT si es notional)
     * @param {number|string} price - Solo para órdenes limit
     * @param {boolean} isNotional - Si es true, usa el campo 'notional' (USDT). Si es false, usa 'size' (BTC).
     */
    placeOrder: async (symbol, side, type, amount, price, isNotional = false) => {
        const body = { 
            symbol, 
            side: side.toLowerCase(), 
            type: type.toLowerCase() 
        };

        if (type === 'limit') {
            body.size = amount.toString();
            body.price = price.toString();
        } else {
            // MARKET ORDERS
            // Si el usuario especifica isNotional (para compras en USDT)
            if (isNotional) {
                body.notional = amount.toString();
            } else {
                // Por defecto usamos size (BTC) para Ventas y Recompras de Short
                body.size = amount.toString();
            }
        }

        console.log(`${LOG_PREFIX} 📡 Enviando a BitMart:`, body);
        const res = await makeRequest('POST', '/spot/v2/submit_order', {}, body);
        return res.data;
    },

    // --- Mercado ---
    getTicker: async (symbol) => {
        const res = await makeRequest('GET', '/spot/v1/ticker', { symbol });
        return res.data.tickers.find(t => t.symbol === symbol);
    },

    getKlines: async (symbol, interval, limit = 200) => {
        const res = await makeRequest('GET', '/spot/quotation/v3/klines', { 
            symbol, step: interval, size: limit 
        });
        return res.data.map(c => ({
            timestamp: parseInt(c[0]),
            open: parseFloat(c[1]),
            high: parseFloat(c[2]),
            low: parseFloat(c[3]),
            close: parseFloat(c[4]),
            volume: parseFloat(c[5])
        }));
    },

    // --- Helpers ---
    initOrderWebSocket,
    getRecentOrders: async (symbol) => bitmartService.getHistoryOrders({ symbol, limit: 50 }),
    placeMarketOrder: async ({ symbol, side, notional }) => bitmartService.placeOrder(symbol, side, 'market', notional, null)
};

module.exports = bitmartService;