// BSB/server/services/bitmartService.js

const axios = require('axios');
const CryptoJS = require('crypto-js');
const { initOrderWebSocket } = require('./bitmartWs');

const BASE_URL = 'https://api-cloud.bitmart.com';
const LOG_PREFIX = '[BITMART_SERVICE]';

// =========================================================================
// MOTOR DE FIRMA Y PETICIONES
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
// LÓGICA DE NEGOCIO
// =========================================================================

const orderStatusMap = { 'filled': 1, 'cancelled': 6, 'all': 0 };

const bitmartService = {
    // --- Autenticación y Balances ---
    validateApiKeys: async () => {
        try {
            await bitmartService.getBalance();
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
        const list = res.data?.data || [];
        return { 
            orders: list.map(o => ({
                ...o,
                state: o.state || 'new',
                price: o.price || o.filled_price || 0,
                size: o.size || o.filled_size || 0
            }))
        };
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
        const rawOrders = res.data?.data?.list || res.data?.data || [];
        
        return rawOrders.map(o => ({
            ...o,
            price: parseFloat(o.priceAvg || o.price || 0),
            size: parseFloat(o.filledSize || o.size || 0),
            state: o.state || (o.status == 1 ? 'filled' : 'open')
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

    placeOrder: async (symbol, side, type, amount, price) => {
        const sideLower = side.toLowerCase();
        const body = { symbol, side: sideLower, type: type.toLowerCase() };

        if (type.toLowerCase() === 'limit') {
            body.size = amount.toString();
            body.price = price.toString();
        } else {
            if (sideLower === 'buy') body.notional = amount.toString();
            else if (sideLower === 'sell') body.size = amount.toString();
            else throw new Error(`Lado no soportado: ${sideLower}`);
        }

        console.log(`${LOG_PREFIX} 📡 Enviando:`, body);
        const res = await makeRequest('POST', '/spot/v2/submit_order', {}, body);
        return res.data;
    },

    // --- Mercado ---
    getTicker: async (symbol) => {
        const res = await makeRequest('GET', '/spot/v1/ticker', { symbol });
        return res.data.tickers.find(t => t.symbol === symbol);
    },

    /**
     * getKlines: RESTAURADO para el indicador RSI y el Analizador
     */
    getKlines: async (symbol, interval, limit = 200) => {
        const res = await makeRequest('GET', '/spot/quotation/v3/klines', { 
            symbol, step: interval, size: limit 
        });
        
        // El analizador espera un array de objetos con estos campos
        return (res.data || []).map(c => ({
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
    
    placeMarketOrder: async ({ symbol, side, notional }) => 
        bitmartService.placeOrder(symbol, side, 'market', notional, null)
};

module.exports = bitmartService;