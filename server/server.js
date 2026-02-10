/**
 * BSB/server/server.js
 * SERVIDOR UNIFICADO (BSB 2026) - Versión Integra con CandleBuilder e IA
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
const bitmartWs = require('./services/bitmartWs'); 
const autobotLogic = require('./autobotLogic.js');
const centralAnalyzer = require('./services/CentralAnalyzer'); 
const aiEngine = require(path.join(__dirname, 'src', 'ai', 'AIEngine')); 
const candleBuilder = require('./src/ai/CandleBuilder'); 
const orderPersistenceService = require('./services/orderPersistenceService');
const orderSyncService = require('./services/orderSyncService');

// Modelos
const User = require('./models/User'); // <--- AÑADIDO PARA INICIALIZACIÓN
const Autobot = require('./models/Autobot');
const Order = require('./models/Order'); 
const MarketSignal = require('./models/MarketSignal');

// Utilidades
const { decrypt } = require('./utils/encryption'); // <--- PARA DESENCRIPTAR LLAVES AL INICIO

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
orderPersistenceService.setIo(io); 

// --- 4. RUTAS API ---
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/orders', require('./routes/ordersRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/autobot', require('./routes/autobotRoutes'));
app.use('/api/v1/config', require('./routes/configRoutes'));
app.use('/api/v1/balance', require('./routes/balanceRoutes'));
app.use('/api/v1/analytics', require('./routes/analyticsRoutes'));
app.use('/api/ai', require('./routes/aiRoutes'));

// --- 5. CONEXIÓN BASE DE DATOS Y ARRANQUE DE SERVICIOS ---
mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log('✅ MongoDB Connected (BSB 2026)...');
        
        // Inicializamos los sockets privados después de conectar a la DB
        await initializePrivateWebSockets();
        
        // Iniciamos el WS del mercado
        setupMarketWS(io);
    })
    .catch(err => console.error('❌ MongoDB Error:', err));

// --- 6. VARIABLES GLOBALES ---
let lastKnownPrice = 0;
let marketWs = null;
let marketHeartbeat = null;
let isMarketConnected = false; 
let lastExecutionTime = 0;
const EXECUTION_THROTTLE_MS = 2000; 

// --- 7. LÓGICA DE EMISIÓN DE ESTADO (REFACTORIZADA PARA MULTIUSUARIO) ---
const emitBotState = (io, state) => {
    if (!state || !state.userId) return;

    const userIdStr = state.userId.toString();

    io.to(userIdStr).emit('bot-state-update', {
        ...state,
        lstate: state.lstate, 
        sstate: state.sstate,
        total_profit: state.total_profit,
        lbalance: state.lbalance, 
        sbalance: state.sbalance,
        ltprice: state.ltprice, 
        stprice: state.stprice,
        lcycle: state.lcycle, 
        scycle: state.scycle,
        userId: userIdStr 
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

                const closedCandle = candleBuilder.processTick(price, volume);
                if (closedCandle) {
                    await MarketSignal.updateOne(
                        { symbol: 'BTC_USDT' },
                        { 
                            $push: { history: { $each: [closedCandle], $slice: -100 } },
                            $set: { lastUpdate: new Date() }
                        },
                        { upsert: true }
                    );
                }

                io.emit('marketData', { price, priceChangePercent, exchangeOnline: isMarketConnected });
                
                const now = Date.now();
                if (now - lastExecutionTime > EXECUTION_THROTTLE_MS) {
                    lastExecutionTime = now;
                    if (mongoose.connection.readyState === 1) { 
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

// --- 9. FUNCIÓN PARA WEBSOCKETS PRIVADOS (REPARADA PARA PERSISTENCIA) ---
const initializePrivateWebSockets = async () => {
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

                bitmartWs.initOrderWebSocket(userIdStr, credentials, async (ordersData) => {
    console.log(`[BACKEND-WS] 📥 Orden detectada via WS para: ${userIdStr}`);
    
    // CORRECCIÓN: Llamamos a la función con el nombre correcto y detectamos la estrategia
    // Nota: ordersData suele ser un array o un objeto dependiendo del evento de BitMart
    const strategy = ordersData.clientOrderId?.startsWith('L_') ? 'long' : 
                     ordersData.clientOrderId?.startsWith('S_') ? 'short' : 'ai';

    await orderPersistenceService.saveExecutedOrder(ordersData, strategy, userIdStr);

    io.to(userIdStr).emit('open-orders-update', ordersData);
    io.to(userIdStr).emit('ai-history-update', ordersData);
});
            } catch (err) {
                console.error(`❌ Error en WS privado para ${user.email}:`, err.message);
            }
        }
    } catch (error) {
        console.error("❌ Error en inicialización privada:", error.message);
    }
};

// --- 10. INTERVALOS DE RESPALDO ---
setInterval(async () => {
    try {
        if (mongoose.connection.readyState === 1) {
            const activeBots = await Autobot.find({ 
                $or: [{ lstate: 'RUNNING' }, { sstate: 'RUNNING' }] 
            }).select('userId');
            
            for(const bot of activeBots) {
                await autobotLogic.slowBalanceCacheUpdate(bot.userId);
            }
        }
    } catch (e) { console.error("Error Balance Loop:", e); }
}, 10000);

// --- 11. Sincronización de Órdenes Abiertas cada 30 segundos
setInterval(async () => {
    try {
        const User = require('./models/User');
        const { decrypt } = require('./utils/encryption');
        
        const users = await User.find({ bitmartApiKey: { $exists: true, $ne: "" } });
        
        for (const user of users) {
            const credentials = {
                apiKey: decrypt(user.bitmartApiKey),
                secretKey: decrypt(user.bitmartSecretKeyEncrypted),
                memo: user.bitmartApiMemo ? decrypt(user.bitmartApiMemo) : ""
            };
            // Llamamos al sincronizador
            await orderSyncService.syncOpenOrders(user._id, credentials, io);
        }
    } catch (err) {
        console.error("❌ Error en el loop de sincronización:", err.message);
    }
}, 30000); // 30 segundos es un buen equilibrio para no saturar la API

// --- 12. EVENTOS SOCKET.IO (REPARADO PARA MULTIUSUARIO Y SALAS) ---
io.on('connection', async (socket) => {
    // El cliente envía su userId al conectar
    let userId = socket.handshake.query.userId;
    
    if (!userId || userId === 'undefined' || userId === 'null') {
        console.warn(`⚠️ Conexión rechazada: Socket ${socket.id} no proporcionó userId válido.`);
        return socket.disconnect();
    }

    const userIdStr = userId.toString();
    console.log(`👤 Usuario Conectado: ${socket.id} unido a sala: ${userIdStr}`);
    
    socket.join(userIdStr); // <--- UNIÓN EXPLÍCITA A LA SALA

    // 1. Enviar estado inicial del Autobot
    try {
        const state = await Autobot.findOne({ userId: userIdStr }).lean();
        if (state) {
            socket.emit('bot-state-update', state);
        }
    } catch (err) {
        console.error("Error fetching initial state:", err);
    }

    // 2. Hidratar historial de órdenes
    const hydrateFromDB = async () => {
        try {
            console.log(`[BACKEND-SYNC] 🔄 Enviando historial a ${userIdStr}`);
            const history = await Order.find({ userId: userIdStr })
                .sort({ orderTime: -1 })
                .limit(20);
            
            socket.emit('ai-history-update', history);
        } catch (err) {
            console.error("❌ Error hidratando desde DB:", err.message);
        }
    };

    await hydrateFromDB();
    socket.on('disconnect', () => console.log(`👤 Desconectado: ${socket.id} de sala: ${userIdStr}`));
});

// --- 13. START ---
server.listen(PORT, async () => {
    try {
        centralAnalyzer.init(io); 
        console.log("🧠 [IA-CORE] Motor sincronizado.");
    } catch (e) { console.error("❌ Error inicialización:", e); }
    console.log(`🚀 SERVIDOR BSB ACTIVO EN PUERTO: ${PORT}`);
});