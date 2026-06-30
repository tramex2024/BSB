/**
 * BSB/server/services/marketService.js
 * BitMart Connection Orchestrator - Centralized and Optimized Version (2026)
 * Optimized: In-memory cache to avoid blocking I/O on every tick.
 */
const WebSocket = require('ws');
const bitmartWs = require('./bitmartWs'); 
const { decrypt } = require('../utils/encryption');
const User = require('../models/User');
const candleBuilder = require('../utils/CandleBuilder');
const centralAnalyzer = require('./CentralAnalyzer');
const MarketSignal = require('../models/MarketSignal');
const autobotLogic = require('../autobotLogic');

let marketWs = null;
let marketHeartbeat = null;
let isMarketConnected = false;

// IN-MEMORY CACHE: Keeps the last known pulse to avoid DB queries on every tick
let cachedAiPulse = null;

async function setupPublicTicker(io) {
    // Preload the last known state at startup to avoid gaps in the UI
    const initialSignal = await MarketSignal.findOne({ symbol: 'BTC_USDT' });
    if (initialSignal) {
        cachedAiPulse = {
            aiConfidence: Math.round((initialSignal.aiConfidence || 0) * 100),
            aiAdx: initialSignal.adx || 0,
            aiTrendLabel: initialSignal.signal || 'Neutral',
            aiEngineMsg: initialSignal.reason || 'System Initialized'
        };
    }

    const bitmartWsUrl = 'wss://ws-manager-compress.bitmart.com/api?protocol=1.1&compression=true';
    
    if (marketWs) { try { marketWs.terminate(); } catch (e) {} }
    
    marketWs = new WebSocket(bitmartWsUrl);
    
    marketWs.on('open', () => {
        isMarketConnected = true;
        console.log("📡 [MARKET_WS] Connection established.");
        marketWs.send(JSON.stringify({ "op": "subscribe", "args": ["spot/ticker:BTC_USDT"] }));

        if (marketHeartbeat) clearInterval(marketHeartbeat);
        marketHeartbeat = setInterval(() => {
            if (marketWs.readyState === WebSocket.OPEN) marketWs.send("ping");
        }, 15000);
    });

    marketWs.on('message', async (data) => {
    // 1. Declaration in the correct scope
    let signalDoc = null; 

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
            
            // 2. Safe conditional logic
            if (closedCandle) {
                // Update DB only when the candle closes
                const updatedSignalDoc = await MarketSignal.findOneAndUpdate(
                    { symbol: 'BTC_USDT' },
                    { 
                        $push: { history: { $each: [closedCandle], $slice: -500 } },
                        $set: { lastUpdate: new Date(), currentPrice: price }
                    },
                    { upsert: true, new: true }
                );

                const analysis = await centralAnalyzer.analyze(updatedSignalDoc.history);
                
                signalDoc = await MarketSignal.findOneAndUpdate(
                    { symbol: 'BTC_USDT' },
                    { 
                        $set: { 
                            rsi14: analysis.rsi14, adx: analysis.adx, stochK: analysis.stochK,
                            stochD: analysis.stochD, macdValue: analysis.macdValue,
                            aiConfidence: analysis.confidence, signal: analysis.signal, reason: analysis.reason
                        }
                    },
                    { new: true }
                );

                // 3. Update cache only when there is new data
                cachedAiPulse = {
                    aiConfidence: Math.round((signalDoc.aiConfidence || 0) * 100),
                    aiAdx: signalDoc.adx || 0,
                    aiTrendLabel: signalDoc.signal || 'Neutral',
                    aiEngineMsg: signalDoc.reason || 'Analyzing...',
                    aiRsi: signalDoc.rsi14,
                    aiStochK: signalDoc.stochK,
                    aiStochD: signalDoc.stochD,
                    aiMacd: signalDoc.macdValue
                };
            }

            // 4. Optimized emission (using cache to avoid blocking)
            io.emit('marketData', { 
                price, 
                priceChangePercent, 
                exchangeOnline: isMarketConnected,
                aiPulse: cachedAiPulse // This already contains all your indicators
            });

            // 5. Bot cycle
            await autobotLogic.botCycle(price);
        }
    } catch (e) { 
        console.error("❌ [MARKET_WS_ERROR]:", e.message); 
    }
});

    marketWs.on('close', () => {
        isMarketConnected = false;
        setTimeout(() => setupPublicTicker(io), 5000);
    });
}

async function initializePrivateWebSockets(io, orderPersistenceService) {
    try {
        const usersWithKeys = await User.find({ bitmartApiKey: { $exists: true, $ne: "" } });
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
                        const strategy = cId.startsWith('L_') ? 'long' : cId.startsWith('S_') ? 'short' : 'ai';
                        await orderPersistenceService.saveExecutedOrder(order, strategy, userIdStr);
                        io.to(userIdStr).emit('open-orders-update', { ...order, strategy });
                    }
                });
            } catch (err) { console.error(`❌ [WS_ERROR] (${user.email}):`, err.message); }
        }
    } catch (error) { console.error("❌ [PRIVATE_INIT_ERROR]:", error.message); }
}

module.exports = { setupPublicTicker, initializePrivateWebSockets };