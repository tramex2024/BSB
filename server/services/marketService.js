/**
 * BSB/server/services/marketService.js
 * Orquestador de Conexiones BitMart - Versión Auditada (Sincronización Total)
 * FIX: RSI Freeze & MarketSignal Continuity
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
    
    if (marketWs) { 
        try { marketWs.terminate(); } catch (e) {} 
    }
    
    marketWs = new WebSocket(bitmartWsUrl);
    
    marketWs.on('open', () => {
        isMarketConnected = true;
        console.log("📡 [MARKET_WS] Conexión establecida con BitMart Public API.");
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

                // 1. Actualización inmediata del precio en el Analizador
                centralAnalyzer.updatePrice(price);

                // 2. Proceso de construcción de vela (ETAPA 1: INGESTA)
                const closedCandle = candleBuilder.processTick(price, volume);
                
                if (closedCandle) {
//                    console.log(`🕯️ [CANDLE-CLOSE] Nueva vela generada: ${closedCandle.close} | Vol: ${closedCandle.volume}`);
                    
                    // 3. Persistencia en DB (ETAPA 2: PERSISTENCIA)
                    // Usamos findOneAndUpdate para obtener el historial actualizado de 250 velas
                    const updatedSignalDoc = await MarketSignal.findOneAndUpdate(
                        { symbol: 'BTC_USDT' },
                        { 
                            $push: { 
                                history: { 
                                    $each: [closedCandle], 
                                    $slice: -250 // Mantenemos el buffer de 250 velas para el RSI
                                } 
                            },
                            $set: { lastUpdate: new Date() }
                        },
                        { upsert: true, new: true } // 'new: true' nos devuelve el documento ya actualizado
                    );

                    // 4. Recálculo Mandatorio (ETAPA 3: AUDITORÍA DE RSI)
                    // Le pasamos el historial completo para que el RSI no se congele
                    if (updatedSignalDoc && updatedSignalDoc.history) {
                        await centralAnalyzer.analyze(updatedSignalDoc.history);
                    }
                }

                // 5. Emisión a Frontend y Lógica de Bot
                io.emit('marketData', { price, priceChangePercent, exchangeOnline: isMarketConnected });
                await autobotLogic.botCycle(price);
            }
        } catch (e) { 
            console.error("❌ [MARKET_WS_ERROR]:", e.message); 
        }
    });

    marketWs.on('close', () => {
        isMarketConnected = false;
        console.warn("⚠️ [MARKET_WS] Conexión cerrada. Reintentando en 5s...");
        setTimeout(() => setupPublicTicker(io), 5000);
    });
}

// --- GESTIÓN DE WEBSOCKETS PRIVADOS (Órdenes de Usuarios) ---
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
                console.error(`❌ [PRIVATE_WS_ERROR] (${user.email}):`, err.message);
            }
        }
    } catch (error) {
        console.error("❌ [PRIVATE_INIT_ERROR]:", error.message);
    }
}

module.exports = { setupPublicTicker, initializePrivateWebSockets };