/**
 * BSB/server/services/marketService.js
 * Orquestador de Conexiones BitMart - Versión Centralizada y Optimizada (2026)
 * Optimizada: Caché en memoria para evitar I/O bloqueante en cada tick.
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

// CACHÉ EN MEMORIA: Mantiene el último pulso conocido para evitar consultas a BD en cada tick
let cachedAiPulse = null;

async function setupPublicTicker(io) {
    // Precarga del último estado conocido al iniciar para evitar huecos en la UI
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
        console.log("📡 [MARKET_WS] Conexión establecida.");
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
                
                // Si la vela cierra, actualizamos la base de datos y refrescamos nuestra caché
                if (closedCandle) {
                    const updatedSignalDoc = await MarketSignal.findOneAndUpdate(
                        { symbol: 'BTC_USDT' },
                        { 
                            $push: { history: { $each: [closedCandle], $slice: -500 } },
                            $set: { lastUpdate: new Date(), currentPrice: price }
                        },
                        { upsert: true, new: true }
                    );

                    const analysis = await centralAnalyzer.analyze(updatedSignalDoc.history);
                    
                    const signalDoc = await MarketSignal.findOneAndUpdate(
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

                    // ACTUALIZACIÓN DE CACHÉ: Solo ocurre cuando cierra vela
                    cachedAiPulse = {
                        aiConfidence: Math.round((signalDoc.aiConfidence || 0) * 100),
                        aiAdx: signalDoc.adx || 0,
                        aiTrendLabel: signalDoc.signal || 'Neutral',
                        aiEngineMsg: signalDoc.reason || 'Analyzing...'
                    };
                }

                // 4. EMISIÓN: Siempre enviamos la caché (ya sea la inicial o la actualizada)
                io.emit('marketData', { 
                    price, 
                    priceChangePercent, 
                    exchangeOnline: isMarketConnected,
                    aiPulse: cachedAiPulse
                });

                // 5. Ciclo de Bots de Usuarios
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