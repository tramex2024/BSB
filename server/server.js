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
const bitmartWs = require('./services/bitmartWs'); // Importado para manejo de WS privados
const autobotLogic = require('./autobotLogic.js');
const centralAnalyzer = require('./services/CentralAnalyzer'); 
const aiEngine = require(path.join(__dirname, 'src', 'ai', 'AIEngine')); 
const candleBuilder = require('./src/ai/CandleBuilder'); // <--- AÑADIDO
const orderPersistenceService = require('./services/orderPersistenceService');

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
/**
 * Emite el estado del bot únicamente a la sala privada del usuario dueño.
 * @param {Object} io - Instancia de Socket.io
 * @param {Object} state - Documento del bot desde MongoDB (debe incluir userId)
 */
const emitBotState = (io, state) => {
    // Validamos que exista el estado y que tenga un dueño asignado
    if (!state || !state.userId) {
        // console.warn("⚠️ Intento de emisión de estado sin userId válido.");
        return;
    }

    const userIdStr = state.userId.toString();

    // Enviamos los datos ÚNICAMENTE a la sala (room) del usuario
    io.to(userIdStr).emit('bot-state-update', {
        // Mantenemos la estructura de datos que espera tu frontend
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
        // Añadimos explícitamente el userId para validación del lado del cliente
        userId: userIdStr 
    });

    // console.log(`[SOCKET] 📤 Estado enviado a sala privada: ${userIdStr}`);
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

                // --- INTEGRACIÓN CANDLEBUILDER ---
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
                // ---------------------------------

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

// --- 9. FUNCIÓN PARA WEBSOCKETS PRIVADOS (REPARADA) ---
const initializePrivateWebSockets = async () => {
    try {
        const botsWithKeys = await Autobot.find({ 
            "apiKeys.apiKey": { $exists: true, $ne: "" } 
        });

        for (const bot of botsWithKeys) {
            const credentials = {
                apiKey: bot.apiKeys.apiKey,
                secretKey: bot.apiKeys.secretKey,
                memo: bot.apiKeys.memo
            };

            bitmartWs.initOrderWebSocket(bot.userId, credentials, (ordersData) => {
    console.log(`[BACKEND-WS] 📥 Enviando órdenes abiertas a sala: ${bot.userId}`);
    // USAR .to() NO .emit()
    io.to(bot.userId.toString()).emit('open-orders-update', ordersData);
});
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

// --- 11. EVENTOS SOCKET.IO (REPARADO PARA MULTIUSUARIO) ---
io.on('connection', async (socket) => {
    // El cliente debe enviar su userId al conectar (ej: socket.io?userId=123)
    const userId = socket.handshake.query.userId;
    
    if (!userId) {
        console.log(`⚠️ Conexión rechazada: No se proporcionó userId`);
        return socket.disconnect();
    }

    console.log(`👤 Usuario Conectado: ${socket.id} (Sala: ${userId})`);
    socket.join(userId); // <--- CREAMOS LA SALA PRIVADA

    // 1. Enviar estado inicial solo de SU bot
    try {
        const state = await Autobot.findOne({ userId }).lean();
        if (state) {
            // Enviamos solo a este socket específico
            socket.emit('bot-state-update', state);
        }
    } catch (err) {
        console.error("Error fetching initial state:", err);
    }

    // 2. Hidratar historial solo de SU bot
    const hydrateFromDB = async () => {
        try {
            console.log(`[BACKEND-SYNC] 🔄 Hidratando órdenes privadas para ${userId}`);
            const history = await Order.find({ userId }) // <--- FILTRO POR USERID
                .sort({ orderTime: -1 })
                .limit(20);
            
            socket.emit('ai-history-update', history);
        } catch (err) {
            console.error("❌ Error hidratando desde DB:", err.message);
        }
    };

    await hydrateFromDB();
    socket.on('disconnect', () => console.log(`👤 Desconectado: ${socket.id}`));
});

// --- 12. START ---
server.listen(PORT, async () => {
    try {
        centralAnalyzer.init(io); 
        // Eliminado aiEngine.init() para favorecer la nueva arquitectura limpia
        console.log("🧠 [IA-CORE] Motor sincronizado.");
    } catch (e) { console.error("❌ Error inicialización:", e); }
    console.log(`🚀 SERVIDOR BSB ACTIVO EN PUERTO: ${PORT}`);
});