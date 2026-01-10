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

// --- 2. CONFIGURACIÓN DE MIDDLEWARES (Orden Crítico) ---
// Primero habilitamos lectura de JSON y CORS antes que cualquier ruta
app.use(express.json()); 

// Configuración de CORS mejorada
app.use(cors({
    origin: true, // Permite cualquier origen que conecte
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with']
}));

// --- 3. CONFIGURACIÓN DE SOCKET.IO ---
const io = new Server(server, {
    cors: {
        origin: ["https://bsb-lime.vercel.app", "http://localhost:3000"],
        methods: ["GET", "POST"]
    },
    path: '/socket.io'
});

// Vinculamos sockets a los motores
autobotLogic.setIo(io);
aiEngine.setIo(io); 

// --- 4. DEFINICIÓN DE RUTAS ---
const aiRoutes = require('./routes/aiRoutes'); 

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/orders', require('./routes/ordersRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/autobot', require('./routes/autobotRoutes'));
app.use('/api/ai', aiRoutes); // 🧠 Ruta unificada para la IA
app.use('/api/v1/config', require('./routes/configRoutes'));
app.use('/api/v1/bot-state', require('./routes/balanceRoutes'));
app.use('/api/v1/analytics', require('./routes/analyticsRoutes'));

// --- 5. CONEXIÓN BASE DE DATOS ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected...'))
    .catch(err => console.error('❌ MongoDB Error:', err));

/**
 * emitBotState: Sincronización inicial
 */
const emitBotState = (io, state) => {
    if (!state) return;
    const totalCurrentBalance = (state.lbalance || 0) + (state.sbalance || 0);
    const profitPercent = totalCurrentBalance > 0 
        ? ((state.total_profit || 0) / totalCurrentBalance) * 100 
        : 0;

    io.sockets.emit('bot-state-update', {
        ...state, // Enviamos el estado completo de forma eficiente
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

                // A. Análisis por Minuto (Indicadores)
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

                // B. Emisión de Precio Real-time
                io.emit('marketData', { price, priceChangePercent });
                
                // 🧠 C. MOTOR IA (Análisis Autónomo Tick-a-Tick)
                try {
                    aiEngine.analyze(price);
                } catch (aiErr) {
                    console.error("⚠️ Error en AIEngine:", aiErr.message);
                }

                // D. CICLO DE AUTOBOT (Órdenes Reales)
                await autobotLogic.botCycle(price);
            }
        } catch (e) { /* Error silenciado para mantener flujo WS */ }
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

// --- 9. ARRANQUE DEL SERVIDOR ---
setupMarketWS(io);

io.on('connection', (socket) => {
    console.log(`👤 Usuario conectado: ${socket.id}`);
    Autobot.findOne({}).lean().then(state => {
        if (state) emitBotState(io, state);
    });
});

server.listen(PORT, () => {
    console.log(`🚀 SERVIDOR BSB ACTIVO: PUERTO ${PORT}`);
});