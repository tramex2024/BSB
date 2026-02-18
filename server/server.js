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
        aistate: state.aistate,
        aibalance: state.aibalance,
        ailastEntryPrice: state.ailastEntryPrice,
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

                // --- GESTIÓN DE VELAS (Fuente de Verdad Única para el Historial) ---
                const closedCandle = candleBuilder.processTick(price, volume);
                if (closedCandle) {
                    // Solo el WebSocket añade velas y mantiene el límite de 250
                    await MarketSignal.updateOne(
                        { symbol: 'BTC_USDT' },
                        { 
                            $push: { 
                                history: { 
                                    $each: [closedCandle], 
                                    $slice: -250 
                                } 
                            },
                            $set: { lastUpdate: new Date() }
                        },
                        { upsert: true }
                    );
                    
                    // Ejecutamos el análisis técnico inmediatamente después de cerrar la vela
                    // para que los indicadores se calculen con el historial actualizado.
                    await centralAnalyzer.analyze();
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
                    if (!ordersData) return;

                    console.log(`[BACKEND-WS] 📥 Orden detectada via WS para: ${userIdStr}`);
                    
                    const cId = ordersData.clientOrderId || "";
                    // AJUSTE: Mapeo estricto de estrategia para consistencia con DB y Frontend
                    const strategy = cId.startsWith('L_') ? 'long' : 
                                     cId.startsWith('S_') ? 'short' : 
                                     cId.toUpperCase().startsWith('AI_') ? 'ai' : 'ex';

                    await orderPersistenceService.saveExecutedOrder(ordersData, strategy, userIdStr);

                    // 📢 Emisión a la sala específica del usuario con la estrategia detectada
                    io.to(userIdStr).emit('open-orders-update', { ...ordersData, strategy });
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
                $or: [{ lstate: { $ne: 'STOPPED' } }, { sstate: { $ne: 'STOPPED' } }, { aistate: { $ne: 'STOPPED' } }] 
            }).select('userId');
            
            for(const bot of activeBots) {
                await autobotLogic.slowBalanceCacheUpdate(bot.userId);
            }
        }
    } catch (e) { console.error("Error Balance Loop:", e); }
}, 10000);

// --- 11. Sincronización de Órdenes Abiertas con "Freno de Mano" para errores 401 ---
setInterval(async () => {
    try {
        if (mongoose.connection.readyState !== 1) return;

        // Buscamos usuarios activos que NO estén marcados con error de API
        const users = await User.find({ 
            bitmartApiKey: { $exists: true, $ne: "" },
            bitmartSecretKeyEncrypted: { $exists: true, $ne: "" },
            apiStatus: { $ne: "INVALID_CREDENTIALS" } // <--- Filtro inteligente
        });
        
        for (const user of users) {
            try {
                const credentials = {
                    apiKey: decrypt(user.bitmartApiKey),
                    secretKey: decrypt(user.bitmartSecretKeyEncrypted),
                    memo: user.bitmartApiMemo ? decrypt(user.bitmartApiMemo) : ""
                };

                if (!credentials.apiKey || !credentials.secretKey) continue;

                // Intentamos sincronizar
                const defaultSymbol = "BTC_USDT";
                await orderSyncService.syncOpenOrders(user._id, credentials, io);

            } catch (userErr) {
                // Si el error es 401 (Unauthorized), desactivamos sincronización para este usuario
                if (userErr.message.includes('401') || userErr.message.includes('Unauthorized')) {
                    console.error(`⚠️ [SYNC] Bloqueando sincronización para ${user._id} por llaves inválidas.`);
                    await User.updateOne({ _id: user._id }, { $set: { apiStatus: "INVALID_CREDENTIALS" } });
                    
                    // Notificar al frontend del usuario específico
                    io.to(user._id.toString()).emit('api-error', { 
                        message: "Tus API Keys de BitMart son inválidas o expiraron. Por favor actualízalas." 
                    });
                } else {
                    console.error(`❌ Error sincronizando órdenes para usuario ${user._id}:`, userErr.message);
                }
            }
        }
    } catch (err) {
        console.error("❌ Error CRÍTICO en el loop de sincronización:", err.message);
    }
}, 60000); // <--- Aumentamos a 60 segundos para dar respiro al servidor

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