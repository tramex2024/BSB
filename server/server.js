const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");
const WebSocket = require('ws');
const path = require('path');

// --- 1. IMPORTACIÓN DE SERVICIOS Y LÓGICA ---
const bitmartService = require('./services/bitmartService');
const autobotLogic = require('./autobotLogic.js');
const centralAnalyzer = require('./services/CentralAnalyzer'); 

// IMPORTACIÓN SEGURA (Case-sensitive para Linux/Render)
const aiEngine = require(path.join(__dirname, 'src', 'ai', 'AIEngine')); 

// Modelos
const Autobot = require('./models/Autobot');
const Aibot = require('./models/Aibot'); 
const MarketSignal = require('./models/MarketSignal');
const AIBotOrder = require('./models/AIBotOrder');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// --- 2. CONFIGURACIÓN DE MIDDLEWARES ---
const allowedOrigins = [
    'https://bsb-lime.vercel.app', 
    'http://localhost:3000', 
    'http://127.0.0.1:3000',
    'http://localhost:5500', 
    'http://127.0.0.1:5500'  
];
app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('CORS no permitido'), false);
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json()); 

// --- 3. CONFIGURACIÓN DE SOCKET.IO ---
const io = new Server(server, {
    cors: { origin: allowedOrigins, methods: ["GET", "POST"], credentials: true },
    path: '/socket.io'
});

autobotLogic.setIo(io);
aiEngine.setIo(io); 

// --- 4. RUTAS API ---
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

// --- 6. VARIABLES GLOBALES ---
let lastKnownPrice = 0;
let marketWs = null;
let marketHeartbeat = null;
let isMarketConnected = false; 
let lastExecutionTime = 0;
const EXECUTION_THROTTLE_MS = 2000; // Control de frecuencia para Bots e IA

// --- 7. WEBSOCKET BITMART ---
const bitmartWsUrl = 'wss://ws-manager-compress.bitmart.com/api?protocol=1.1&compression=true';

function setupMarketWS(io) {
    if (marketWs) { try { marketWs.terminate(); } catch (e) {} }
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

                centralAnalyzer.updatePrice(price);

                // Emitimos SIEMPRE al dashboard para fluidez visual
                io.emit('marketData', { price, priceChangePercent, exchangeOnline: isMarketConnected });
                
                // 🚀 GATILLO CONTROLADO (THROTTLE) PARA IA Y BOT
                const now = Date.now();
                if (now - lastExecutionTime > EXECUTION_THROTTLE_MS) {
                    lastExecutionTime = now;

                    if (mongoose.connection.readyState === 1) { 
                        try { 
                            await aiEngine.analyze(price, volume); 
                            
                            if (aiEngine.isRunning) {
                                io.emit('ai-status-update', { 
                                    isRunning: true, 
                                    historyCount: aiEngine.history.length,
                                    virtualBalance: aiEngine.virtualBalance
                                });
                            }
                        } catch (aiErr) { console.error("⚠️ AI Error:", aiErr.message); }
                        
                        // Ejecución de ciclos de Autobot (LRunning, SRunning, etc)
                        await autobotLogic.botCycle(price);
                    }
                }
            }
        } catch (e) { console.error("❌ WS Msg Error:", e.message); }
    });

    marketWs.on('close', () => {
        isMarketConnected = false; 
        setTimeout(() => setupMarketWS(io), 5000);
    });
}

// --- 8. WS ÓRDENES PRIVADAS ---
bitmartService.initOrderWebSocket((ordersData) => {
    io.sockets.emit('open-orders-update', ordersData);
});

// --- 9. BUCLE SALDOS ---
setInterval(async () => {
    try {
        if (mongoose.connection.readyState === 1) await autobotLogic.slowBalanceCacheUpdate();
    } catch (e) { console.error("Error Balance Loop:", e); }
}, 10000);

setupMarketWS(io);

// --- 10. SOCKET.IO EVENTS ---
io.on('connection', (socket) => {
    console.log(`👤 Conectado: ${socket.id}`);

    const sendAiStatus = async () => {
        try {
            let state = await Aibot.findOne({});
            if (!state) state = await Aibot.create({ isRunning: false, virtualBalance: 100.00 });
            socket.emit('ai-status-init', {
                isRunning: aiEngine.isRunning,
                virtualBalance: aiEngine.virtualBalance || state.virtualBalance,
                historyCount: aiEngine.history ? aiEngine.history.length : 0
            });
        } catch (err) { console.error("❌ Error AI Socket:", err); }
    };

    sendAiStatus();

    socket.on('toggle-ai', async (data) => {
        try {
            const result = await aiEngine.toggle(data.action);
            if (result.isRunning) await aiEngine.init();
            io.emit('ai-status-update', { isRunning: result.isRunning, virtualBalance: result.virtualBalance });
        } catch (err) { console.error("❌ Error toggle:", err); }
    });

    socket.on('get-ai-history', async () => {
        const trades = await AIBotOrder.find({ isVirtual: true })
            .sort({ timestamp: -1 })
            .limit(5);
        socket.emit('ai-history-data', trades);
    });

    socket.on('disconnect', () => console.log(`👤 Desconectado: ${socket.id}`));
});

// --- 11. START ---
server.listen(PORT, async () => {
    try {
        // INICIO DE SERVICIOS CENTRALIZADOS
        centralAnalyzer.init(io); 
        console.log("🧠 [CENTRAL-ANALYZER] Iniciado correctamente.");

        await aiEngine.init();
        console.log("🧠 [IA-CORE] Memoria recuperada satisfactoriamente.");
    } catch (e) { console.error("❌ Error inicialización:", e); }
    console.log(`🚀 SERVIDOR BSB ACTIVO: PUERTO ${PORT}`);
});