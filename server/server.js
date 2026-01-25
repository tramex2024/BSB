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
const Aibot = require('./models/Aibot'); // Modelo de persistencia para IA
const MarketSignal = require('./models/MarketSignal');
const AIBotOrder = require('./models/AIBotOrder');
const analyzer = require('./src/bitmart_indicator_analyzer'); 

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// --- 2. CONFIGURACIÓN DE MIDDLEWARES (CORS) ---
const allowedOrigins = [
    'https://bsb-lime.vercel.app', 
    'http://localhost:3000', 
    'http://127.0.0.1:3000',
    'http://localhost:5500', 
    'http://127.0.0.1:5500'  
];
app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            return callback(new Error('CORS no permitido'), false);
        }
        return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json()); 

// --- 3. CONFIGURACIÓN DE SOCKET.IO ---
const io = new Server(server, {
    cors: { 
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true
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
app.use('/api/v1/balance', require('./routes/balanceRoutes'));
app.use('/api/v1/analytics', require('./routes/analyticsRoutes'));
app.use('/api/ai', require('./routes/aiRoutes'));

// --- 5. CONEXIÓN BASE DE DATOS ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected (BSB 2026 - Persistencia Total)...'))
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
    if (marketWs) {
        try { marketWs.terminate(); } catch (e) {}
    }
    marketWs = new WebSocket(bitmartWsUrl);
    
    marketWs.on('open', () => {
        isMarketConnected = true; 
        console.log("📡 [MARKET_WS] Conectado. Suscribiendo BTC_USDT...");
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

                lastKnownPrice = price; 
                const currentMinute = new Date().getMinutes();

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
                
                if (mongoose.connection.readyState === 1) { 
                    try { 
                        aiEngine.analyze(price, volume); 
                    } catch (aiErr) { 
                        console.error("⚠️ AI Error:", aiErr.message); 
                    }
                    await autobotLogic.botCycle(price);
                }
            }
        } catch (e) { console.error("❌ WS Msg Error:", e.message); }
    });

    marketWs.on('close', () => {
        isMarketConnected = false; 
        setTimeout(() => setupMarketWS(io), 5000);
    });
}

// --- 8. WEBSOCKET ÓRDENES PRIVADAS ---
bitmartService.initOrderWebSocket((ordersData) => {
    io.sockets.emit('open-orders-update', ordersData);
});

// --- 9. BUCLE SALDOS (Cada 10s) ---
setInterval(async () => {
    try {
        if (mongoose.connection.readyState === 1) {
            await autobotLogic.slowBalanceCacheUpdate();
        }
    } catch (e) { console.error("Error Balance Loop:", e); }
}, 10000);

setupMarketWS(io);

// --- 10. GESTIÓN DE EVENTOS SOCKET.IO ---
io.on('connection', (socket) => {
    console.log(`👤 Usuario conectado: ${socket.id}`);

    const sendFullBotStatus = async () => {
        try {
            const state = await Autobot.findOne({}).lean();
            if (state) {
                const currentPrice = autobotLogic.getLastPrice() || lastKnownPrice;
                socket.emit('bot-state-update', { ...state, price: currentPrice });
            }
        } catch (err) { console.error("❌ Error Status Socket:", err); }
    };

    const sendAiStatus = async () => {
        try {
            let aiState = await Aibot.findOne({});
            if (!aiState) aiState = await Aibot.create({ isRunning: false, virtualBalance: 100.00 });

            socket.emit('ai-status-init', {
                isRunning: aiEngine.isRunning,
                virtualBalance: aiEngine.virtualBalance || aiState.virtualBalance,
                historyCount: aiEngine.history ? aiEngine.history.length : (aiState.historyPoints?.length || 0)
            });
        } catch (err) { console.error("❌ Error AI Status Socket:", err); }
    };

    sendFullBotStatus();
    sendAiStatus();

    socket.on('toggle-ai', async (data) => {
        try {
            const result = await aiEngine.toggle(data.action);
            if (result.isRunning) await aiEngine.init();

            io.emit('ai-status-update', { 
                isRunning: result.isRunning, 
                virtualBalance: result.virtualBalance 
            });
            console.log(`[SOCKET] IA Core ${data.action.toUpperCase()} por ${socket.id}`);
        } catch (err) { console.error("❌ Error toggle-ai:", err); }
    });

    socket.on('get-bot-state', () => sendFullBotStatus());
    socket.on('get-ai-status', () => sendAiStatus());
    socket.on('get-ai-history', async () => {
        try {
            const history = await AIBotOrder.find({ isVirtual: true }).sort({ timestamp: -1 }).limit(30);
            socket.emit('ai-history-data', history);
        } catch (err) { console.error("❌ Error Historial IA:", err); }
    });

    socket.on('disconnect', () => console.log(`👤 Usuario desconectado: ${socket.id}`));
});

// --- 11. ARRANQUE DEL SERVIDOR ---
server.listen(PORT, async () => {
    try {
        await aiEngine.init();
        console.log("🧠 [IA-CORE] Memoria recuperada desde MongoDB");
    } catch (e) {
        console.error("❌ Error inicializando IA:", e);
    }
    console.log(`
    🚀 ==========================================
    🚀 SERVIDOR BSB ACTIVO: PUERTO ${PORT}
    🚀 IA CORE: ${aiEngine.isRunning ? 'RUNNING' : 'STANDBY'}
    🚀 ==========================================
    `);
});