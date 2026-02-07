/**
 * BSB/server/server.js
 * SERVIDOR UNIFICADO (BSB 2026) - Lógica de Órdenes Restaurada (Versión Funcional)
 */

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
const aiEngine = require(path.join(__dirname, 'src', 'ai', 'AIEngine')); 

// Modelos
const Autobot = require('./models/Autobot');
const Order = require('./models/Order'); 
const MarketSignal = require('./models/MarketSignal');

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
    .then(() => console.log('✅ MongoDB Connected (BSB 2026)...'))
    .catch(err => console.error('❌ MongoDB Error:', err));

// --- 6. VARIABLES GLOBALES ---
let lastKnownPrice = 0;
let marketWs = null;
let marketHeartbeat = null;
let isMarketConnected = false; 
let lastExecutionTime = 0;
const EXECUTION_THROTTLE_MS = 2000; 

// --- 7. LÓGICA DE EMISIÓN DE ESTADO (RECUPERADA DE LA VERSIÓN ANTIGUA) ---
// Esta función asegura que el frontend reciba todos los datos para evitar ceros
const emitBotState = (io, state) => {
    if (!state) return;
    io.sockets.emit('bot-state-update', {
        ...state,
        // Aseguramos campos críticos que el Dashboard espera
        lstate: state.lstate, sstate: state.sstate,
        total_profit: state.total_profit,
        lbalance: state.lbalance, sbalance: state.sbalance,
        ltprice: state.ltprice, stprice: state.stprice,
        lcycle: state.lcycle, scycle: state.scycle
    });
};

// --- 8. WEBSOCKET BITMART (PÚBLICO - TICKER) ---
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

                io.emit('marketData', { price, priceChangePercent, exchangeOnline: isMarketConnected });
                
                const now = Date.now();
                if (now - lastExecutionTime > EXECUTION_THROTTLE_MS) {
                    lastExecutionTime = now;
                    if (mongoose.connection.readyState === 1) { 
                        try { 
                            if (aiEngine.isRunning) await aiEngine.analyze(price, volume); 
                        } catch (aiErr) { console.error("⚠️ AI Error:", aiErr.message); }
                        await autobotLogic.botCycle(price);
                    }
                }
            }
        } catch (e) { console.error("❌ WS Msg Error:", e.message); }
    });

    marketWs.on('close', () => {
        isMarketConnected = false; 
        if (marketHeartbeat) clearInterval(marketHeartbeat);
        setTimeout(() => setupMarketWS(io), 5000);
    });
}

// --- 9. WEBSOCKET ÓRDENES PRIVADAS ---
bitmartService.initOrderWebSocket((ordersData) => {
    console.log(`[BACKEND-WS] 📥 Evento privado: ${ordersData.length} órdenes.`);
    io.sockets.emit('open-orders-update', ordersData);
});

// --- 10. INTERVALOS DE RESPALDO (RECUPERADOS DE LA VERSIÓN ANTIGUA) ---

// Sincronización de saldos (10s)
setInterval(async () => {
    try {
        if (mongoose.connection.readyState === 1) await autobotLogic.slowBalanceCacheUpdate();
    } catch (e) { console.error("Error Balance Loop:", e); }
}, 10000);

// Polling de Órdenes (5s) - ESTO ES LO QUE HACÍA QUE LA ANTIGUA FUNCIONARA SÍ O SÍ
setInterval(async () => {
    try {
        const { orders } = await bitmartService.getOpenOrders('BTC_USDT');
        if (orders) io.sockets.emit('open-orders-update', orders);
    } catch (e) { console.error("Error Polling Orders:", e.message); }
}, 5000);

setupMarketWS(io);

// --- 11. EVENTOS SOCKET.IO (CON HIDRATACIÓN MEJORADA) ---
io.on('connection', async (socket) => {
    console.log(`👤 Usuario Conectado: ${socket.id}`);

    // Emitir estado inicial del bot inmediatamente
    Autobot.findOne({}).lean().then(state => {
        if (state) emitBotState(io, state);
    });

    const hydrateOrders = async () => {
        try {
            console.log(`[BACKEND-SYNC] 🔄 Hidratando órdenes para ${socket.id}`);
            const { orders } = await bitmartService.getOpenOrders('BTC_USDT');
            socket.emit('open-orders-update', orders || []);

            const history = await Order.find({ strategy: 'ai' }).sort({ orderTime: -1 }).limit(20);
            socket.emit('ai-history-update', history);
        } catch (err) {
            console.error("❌ Error hidratando órdenes:", err.message);
        }
    };

    await hydrateOrders();

    socket.on('disconnect', () => console.log(`👤 Desconectado: ${socket.id}`));
});

// --- 12. START ---
server.listen(PORT, async () => {
    try {
        centralAnalyzer.init(io); 
        await aiEngine.init();
        console.log("🧠 [IA-CORE] Motor sincronizado.");
    } catch (e) { console.error("❌ Error inicialización:", e); }
    console.log(`🚀 SERVIDOR BSB ACTIVO EN PUERTO: ${PORT}`);
});