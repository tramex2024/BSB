// Archivo: BSB/server/server.js

const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");
const WebSocket = require('ws');

// --- 1. IMPORTACIÓN DE SERVICIOS Y LÓGICA ---
const bitmartService = require('./services/bitmartService');
const autobotLogic = require('./autobotLogic.js');
const aiEngine = require('./src/ai/aiEngine'); 

// Modelos
const Autobot = require('./models/Autobot');
const MarketSignal = require('./models/MarketSignal');
const analyzer = require('./src/bitmart_indicator_analyzer'); 

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// --- 2. CONFIGURACIÓN DE MIDDLEWARES ---
app.use(express.json()); 
app.use(cors());

// --- 3. CONFIGURACIÓN DE SOCKET.IO ---
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    },
    path: '/socket.io'
});

autobotLogic.setIo(io);
aiEngine.setIo(io); 

// --- 4. DEFINICIÓN DE RUTAS API ---
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/orders', require('./routes/ordersRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/autobot', require('./routes/autobotRoutes'));
app.use('/api/v1/config', require('./routes/configRoutes'));
app.use('/api/v1/bot-state', require('./routes/balanceRoutes'));
app.use('/api/v1/analytics', require('./routes/analyticsRoutes'));

// --- 5. CONEXIÓN BASE DE DATOS ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected...'))
    .catch(err => console.error('❌ MongoDB Error:', err));

// --- 6. VARIABLES GLOBALES DE ESTADO ---
let lastKnownPrice = 0;
let lastProcessedMinute = -1;
let marketWs = null;
let marketHeartbeat = null;
let isMarketConnected = false; 

// --- 7. WEBSOCKET BITMART ---
const bitmartWsUrl = 'wss://ws-manager-compress.bitmart.com/api?protocol=1.1&compression=true';

function setupMarketWS(io) {
    if (marketWs) marketWs.terminate();
    marketWs = new WebSocket(bitmartWsUrl);
    
    marketWs.on('open', () => {
        isMarketConnected = true; 
        console.log("📡 [MARKET_WS] ✅ Conectado. Suscribiendo a BTC_USDT...");
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
                const open24h = parseFloat(ticker.open_24h);
                const priceChangePercent = open24h > 0 ? ((price - open24h) / open24h) * 100 : 0;

                lastKnownPrice = price; 
                const now = new Date();
                const currentMinute = now.getMinutes();

                if (currentMinute !== lastProcessedMinute) {
                    lastProcessedMinute = currentMinute;
                    const analysis = await analyzer.runAnalysis(price);
                    await MarketSignal.findOneAndUpdate(
                        { symbol: 'BTC_USDT' },
                        {
                            currentRSI: analysis.currentRSI || 0,
                            signal: analysis.action,
                            reason: analysis.reason,
                            lastUpdate: new Date()
                        },
                        { upsert: true }
                    );
                    io.emit('market-signal-update', analysis);
                }

                io.emit('marketData', { price, priceChangePercent, exchangeOnline: isMarketConnected });
                try { aiEngine.analyze(price); } catch (aiErr) { console.error("⚠️ AI Error:", aiErr.message); }
                await autobotLogic.botCycle(price);
            }
        } catch (e) { console.error("❌ Error WS Message:", e.message); }
    });

    marketWs.on('close', () => {
        isMarketConnected = false; 
        setTimeout(() => setupMarketWS(io), 2000);
    });
}

// --- 8. WEBSOCKET ÓRDENES PRIVADAS ---
bitmartService.initOrderWebSocket((ordersData) => {
    io.sockets.emit('open-orders-update', ordersData);
});

// --- 9. BUCLE SALDOS (10s) ---
setInterval(async () => {
    try {
        const apiSuccess = await autobotLogic.slowBalanceCacheUpdate();
        const botState = await Autobot.findOne({}).lean();
        if (botState) {
            io.sockets.emit('balance-real-update', { 
                source: apiSuccess ? 'API_SUCCESS' : 'CACHE_FALLBACK',
                lastAvailableUSDT: botState.lastAvailableUSDT || 0,
                lastAvailableBTC: botState.lastAvailableBTC || 0,
            });
        }
    } catch (e) { console.error("Error Balance Loop:", e); }
}, 10000);

setupMarketWS(io);

// --- 10. GESTIÓN DE USUARIOS Y EVENTOS ---
io.on('connection', (socket) => {
    console.log(`👤 Usuario conectado: ${socket.id}`);

    // ESCUCHADOR DE CONFIGURACIÓN (Ahora dentro de la conexión)
    socket.on('update-bot-config', async (data) => {
        try {
            console.log("💾 Recibida nueva configuración:", JSON.stringify(data));
            const updated = await Autobot.findOneAndUpdate(
                {}, 
                { $set: { config: data.config } }, 
                { new: true }
            );
            if (updated) {
                io.emit('bot-state-update', updated);
                console.log("✅ Base de Datos actualizada correctamente");
            }
        } catch (err) {
            console.error("❌ Error al actualizar config en DB:", err.message);
        }
    });

    const sendFullBotStatus = async () => {
        try {
            const state = await Autobot.findOne({}).lean();
            if (state) {
                const currentPrice = (autobotLogic && typeof autobotLogic.getLastPrice === 'function') 
                    ? autobotLogic.getLastPrice() : lastKnownPrice;

                socket.emit('bot-state-update', {
                    ...state,
                    price: currentPrice,
                    lstate: state.lstate || 'STOPPED',
                    sstate: state.sstate || 'STOPPED',
                    config: state.config
                });

                const totalAllocated = (state.config?.long?.amountUsdt || 0) + (state.config?.short?.amountUsdt || 0);
                const totalProfit = state.total_profit || 0;
                const profitPercent = totalAllocated > 0 ? (totalProfit / totalAllocated) * 100 : 0;

                socket.emit('bot-stats', {
                    totalProfit: totalProfit,
                    profitChangePercent: profitPercent 
                });
            }
        } catch (err) { console.error("❌ Error Status Socket:", err); }
    };

    sendFullBotStatus();

    socket.on('get-bot-state', () => { sendFullBotStatus(); });

    socket.on('get-ai-status', async () => {
        try {
            const state = await aiEngine.getStatus();
            socket.emit('ai-status-init', state);
        } catch (err) { console.error("Error ai-status:", err); }
    });

    socket.on('toggle-ai', async (data) => {
        try {
            const result = await aiEngine.toggle(data.action);
            io.emit('ai-status-update', { success: true, isRunning: result.isRunning });
        } catch (err) { console.error("Error toggle-ai:", err); }
    });

    socket.on('disconnect', () => { console.log(`👤 Usuario desconectado: ${socket.id}`); });
});

server.listen(PORT, () => {
    console.log(`🚀 SERVIDOR BSB ACTIVO: PUERTO ${PORT}`);
});