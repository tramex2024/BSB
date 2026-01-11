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
const aiEngine = require('./src/ai/aiEngine'); // 🧠 Motor IA

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
app.use(cors()); // CORS abierto para evitar bloqueos en rutas API estándar

// --- 3. CONFIGURACIÓN DE SOCKET.IO ---
const io = new Server(server, {
    cors: {
        origin: "*", // Permitimos conexión desde cualquier origen para WebSockets
        methods: ["GET", "POST"]
    },
    path: '/socket.io'
});

// Vinculamos sockets a los motores
autobotLogic.setIo(io);
aiEngine.setIo(io); 

// --- 4. DEFINICIÓN DE RUTAS API (Opcionales ahora que usamos Sockets) ---
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

/**
 * emitBotState: Sincronización inicial del Autobot
 */
const emitBotState = (io, state) => {
    if (!state) return;
    const totalCurrentBalance = (state.lbalance || 0) + (state.sbalance || 0);
    const profitPercent = totalCurrentBalance > 0 
        ? ((state.total_profit || 0) / totalCurrentBalance) * 100 
        : 0;

    io.sockets.emit('bot-state-update', {
        ...state,
        total_profit: state.total_profit,
        lastAvailableUSDT: state.lastAvailableUSDT
    });

    io.sockets.emit('bot-stats', {
        totalProfit: state.total_profit || 0,
        profitChangePercent: profitPercent 
    });
};

// --- 6. WEBSOCKET BITMART (Market Data + AI Engine) ---
const bitmartWsUrl = 'wss://ws-manager-compress.bitmart.com/api?protocol=1.1&compression=true';
let lastProcessedMinute = -1;
let marketWs = null;
let marketHeartbeat = null;

function setupMarketWS(io) {
    if (marketWs) marketWs.terminate();

    marketWs = new WebSocket(bitmartWsUrl);
    
    marketWs.on('open', () => {
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

                io.emit('marketData', { price, priceChangePercent });
                
                // 🧠 MOTOR IA
                try {
                    aiEngine.analyze(price);
                } catch (aiErr) {
                    console.error("⚠️ Error en AIEngine:", aiErr.message);
                }

                // CICLO DE AUTOBOT
                await autobotLogic.botCycle(price);
            }
        } catch (e) { }
    });

    marketWs.on('close', () => {
        console.log("⚠️ [MARKET_WS] Cerrado. Reconectando...");
        if (marketHeartbeat) clearInterval(marketHeartbeat);
        setTimeout(() => setupMarketWS(io), 2000);
    });

    marketWs.on('error', (err) => console.error("❌ [MARKET_WS] Error:", err.message));
}

// --- 7. WEBSOCKET ÓRDENES PRIVADAS ---
bitmartService.initOrderWebSocket((ordersData) => {
    io.sockets.emit('open-orders-update', ordersData);
});

// --- 8. BUCLE DE SINCRONIZACIÓN DE SALDOS (10s) ---
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

// --- 9. ARRANQUE DEL SERVIDOR Y EVENTOS DE SOCKET ---
setupMarketWS(io);

io.on('connection', (socket) => {
    console.log(`👤 Usuario conectado: ${socket.id}`);

    // Sincronización inicial Autobot
    Autobot.findOne({}).lean().then(state => {
        if (state) emitBotState(io, state);
    });

    // --- EVENTOS DE LA IA (MIGRACIÓN DESDE FETCH) ---

    // 1. Obtener estado inicial (Saldo y Running)
    socket.on('get-ai-status', async () => {
        try {
            const state = await aiEngine.getStatus();
            socket.emit('ai-status-init', state);
        } catch (err) { console.error("Error en socket get-ai-status:", err); }
    });

    // 2. Obtener historial de trades de la IA
    socket.on('get-ai-history', async () => {
        try {
            const history = await aiEngine.getVirtualHistory();
            socket.emit('ai-history-data', history);
        } catch (err) { console.error("Error en socket get-ai-history:", err); }
    });

    // 3. Encender/Apagar IA
    socket.on('toggle-ai', async (data) => {
        try {
            const result = await aiEngine.toggle(data.action);
            // Avisamos a todos los clientes del nuevo estado
            io.emit('ai-status-update', { 
                success: true, 
                isRunning: result.isRunning,
                virtualBalance: result.virtualBalance 
            });
        } catch (err) { console.error("Error en socket toggle-ai:", err); }
    });
});

server.listen(PORT, () => {
    console.log(`🚀 SERVIDOR BSB ACTIVO: PUERTO ${PORT}`);
});