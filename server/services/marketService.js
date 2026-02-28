/**
 * services/marketService.js - Orquestador de Conexiones BitMart
 */
const WebSocket = require('ws');
const bitmartWs = require('./bitmartWs'); 
const { decrypt } = require('../utils/encryption');
const User = require('../models/User');
const candleBuilder = require('../src/ai/CandleBuilder');
const centralAnalyzer = require('./CentralAnalyzer');
const MarketSignal = require('../models/MarketSignal');
const autobotLogic = require('../autobotLogic');

let marketWs = null;
let marketHeartbeat = null;
let isMarketConnected = false;

// --- GESTIÓN DEL TICKER PÚBLICO (Precio BTC) ---
function setupPublicTicker(io) {
    const bitmartWsUrl = 'wss://ws-manager-compress.bitmart.com/api?protocol=1.1&compression=true';
    
    if (marketWs) { try { marketWs.terminate(); } catch (e) {} }
    marketWs = new WebSocket(bitmartWsUrl);
    
    marketWs.on('open', () => {
        isMarketConnected = true;
        console.log("📡 [MARKET_WS] Público Conectado.");
        marketWs.send(JSON.stringify({ "op": "subscribe", "args": ["spot/ticker:BTC_USDT"] }));

        if (marketHeartbeat) clearInterval(marketHeartbeat);
        marketHeartbeat = setInterval(() => {
            if (marketWs.readyState === WebSocket.OPEN) marketWs.send("ping");
        }, 15000);
    });

    marketWs.on('message', async (data) => {
        try {
            const rawData = data.toString();
            if (rawData === 'pong') return;
            const parsed = JSON.parse(rawData);
            
            if (parsed.data && parsed.data[0]?.symbol === 'BTC_USDT') {
                const ticker = parsed.data[0];
                const price = parseFloat(ticker.last_price);
                const volume = parseFloat(ticker.base_volume_24h || 0);
                const open24h = parseFloat(ticker.open_24h);
                const priceChangePercent = open24h > 0 ? ((price - open24h) / open24h) * 100 : 0;

                centralAnalyzer.updatePrice(price);

                const closedCandle = candleBuilder.processTick(price, volume);
                if (closedCandle) {
                    await MarketSignal.updateOne(
                        { symbol: 'BTC_USDT' },
                        { 
                            $push: { history: { $each: [closedCandle], $slice: -250 } },
                            $set: { lastUpdate: new Date() }
                        },
                        { upsert: true }
                    );
                    await centralAnalyzer.analyze();
                }

                io.emit('marketData', { price, priceChangePercent, exchangeOnline: isMarketConnected });
                await autobotLogic.botCycle(price);
            }
        } catch (e) { console.error("❌ Public WS Error:", e.message); }
    });

    marketWs.on('close', () => {
        isMarketConnected = false;
        setTimeout(() => setupPublicTicker(io), 5000);
    });
}

// --- GESTIÓN DE WEBSOCKETS PRIVADOS (Órdenes) ---
async function initializePrivateWebSockets(io, orderPersistenceService) {
    try {
        const usersWithKeys = await User.find({ 
            bitmartApiKey: { $exists: true, $ne: "" } 
        });

        for (const user of usersWithKeys) {
            try {
                const credentials = {
                    apiKey: decrypt(user.bitmartApiKey),
                    secretKey: decrypt(user.bitmartSecretKeyEncrypted),
                    memo: user.bitmartApiMemo ? decrypt(user.bitmartApiMemo) : ""
                };

                const userIdStr = user._id.toString();

                bitmartWs.initOrderWebSocket(userIdStr, credentials, async (ordersDataArray) => {
                    if (!ordersDataArray) return;

                    for (const order of ordersDataArray) {
                        const cId = order.clientOrderId || "";
                        const strategy = cId.startsWith('L_') ? 'long' : 
                                         cId.startsWith('S_') ? 'short' : 
                                         cId.toUpperCase().startsWith('AI_') ? 'ai' : 'ex';

                        await orderPersistenceService.saveExecutedOrder(order, strategy, userIdStr);
                        io.to(userIdStr).emit('open-orders-update', { ...order, strategy });
                    }
                });
            } catch (err) {
                console.error(`❌ WS Privado Error (${user.email}):`, err.message);
            }
        }
    } catch (error) {
        console.error("❌ Error inicialización privada:", error.message);
    }
}

module.exports = { setupPublicTicker, initializePrivateWebSockets };