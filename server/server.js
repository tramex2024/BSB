// Archivo: BSB/server/server.js

const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");
const WebSocket = require('ws');

// Servicios y Lógica del Bot
const bitmartService = require('./services/bitmartService');
const autobotLogic = require('./autobotLogic.js');
const aiEngine = require('./src/ai/aiEngine'); // 🧠 Importamos el nuevo motor IA

// Modelos
const Autobot = require('./models/Autobot');
const MarketSignal = require('./models/MarketSignal');
const analyzer = require('./src/bitmart_indicator_analyzer'); 

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// --- CONFIGURACIÓN DE SOCKET.IO ---
const io = new Server(server, {
    cors: {
        origin: ["https://bsb-lime.vercel.app", "http://localhost:3000"],
        methods: ["GET", "POST"]
    },
    path: '/socket.io'
});

autobotLogic.setIo(io);
aiEngine.setIo(io); // 🧠 Vinculamos socket al motor de IA para logs en tiempo real

// --- MIDDLEWARES ---
app.use(cors());
app.use(express.json());

// --- RUTAS ---
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/orders', require('./routes/ordersRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/autobot', require('./routes/autobotRoutes'));
app.use('/api/v1/config', require('./routes/configRoutes'));
app.use('/api/v1/bot-state', require('./routes/balanceRoutes'));
app.use('/api/v1/analytics', require('./routes/analyticsRoutes'));
app.use('/api/ai', require('./routes/aiRoutes')); // 🧠 Nueva ruta para el AIBot

// --- CONEXIÓN DB ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected...'))
    .catch(err => console.error('❌ MongoDB Error:', err));

/**
 * emitBotState: Función auxiliar para sincronización inicial
 */
const emitBotState = (io, state) => {
    if (!state) return;
    const totalCurrentBalance = (state.lbalance || 0) + (state.sbalance || 0);
    const profitPercent = totalCurrentBalance > 0 
        ? ((state.total_profit || 0) / totalCurrentBalance) * 100 
        : 0;

    io.sockets.emit('bot-state-update', {
        lstate: state.lstate,
        sstate: state.sstate,
        total_profit: state.total_profit,
        lbalance: state.lbalance,
        sbalance: state.sbalance,
        lprofit: state.lprofit,
        sprofit: state.sprofit,
        lastAvailableUSDT: state.lastAvailableUSDT,
        ltprice: state.ltprice,
        stprice: state.stprice,
        lsprice: state.lsprice,
        sbprice: state.sbprice,
        lcycle: state.lcycle,
        scycle: state.scycle,
        lcoverage: state.lcoverage,
        scoverage: state.scoverage,
        lnorder: state.lnorder,
        snorder: state.snorder
    });

    io.sockets.emit('bot-stats', {
        totalProfit: state.total_profit || 0,
        profitChangePercent: profitPercent 
    });
};

// --- WEBSOCKET BITMART (LÓGICA MARKET DATA MEJORADA) ---
const bitmartWsUrl = 'wss://ws-manager-compress.bitmart.com/api?protocol=1.1&compression=true';
let lastProcessedMinute = -1;
let marketWs = null;
let marketHeartbeat = null;

function setupMarketWS(io) {
    if (marketWs) {
        marketWs.terminate();
    }

    marketWs = new WebSocket(bitmartWsUrl);
    
    marketWs.on('open', () => {
        console.log("📡 [MARKET_WS] ✅ Conectado. Suscribiendo a Ticker...");
        marketWs.send(JSON.stringify({ "op": "subscribe", "args": ["spot/ticker:BTC_USDT"] }));

        if (marketHeartbeat) clearInterval(marketHeartbeat);
        marketHeartbeat = setInterval(() => {
            if (marketWs.readyState === WebSocket.OPEN) {
                marketWs.send("ping");
            }
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

                // 1. ANÁLISIS GLOBAL (Cada minuto)
                const now = new Date();
                const currentMinute = now.getMinutes();

                if (currentMinute !== lastProcessedMinute) {
                    lastProcessedMinute = currentMinute;
                    const analysis = await analyzer.runAnalysis(price);
                    
                    await MarketSignal.findOneAndUpdate(
                        { symbol: 'BTC_USDT' },
                        {
                            currentRSI: analysis.currentRSI || 0,
                            prevRSI: analysis.lastCompleteCandleRSI || 0,
                            signal: analysis.action,
                            reason: analysis.reason,
                            lastUpdate: new Date()
                        },
                        { upsert: true, new: true }
                    );
                    io.emit('market-signal-update', analysis);
                }

                // 2. EMISIÓN DE PRECIO AL FRONTEND
                io.emit('marketData', { price, priceChangePercent });
                
                // 🧠 3. MOTOR DE INTELIGENCIA ARTIFICIAL (Independiente)
                // Le pasamos el precio actual al AIEngine para su análisis autónomo
                aiEngine.analyze(price);

                // 4. CICLO DE AUTOBOT (Atómico: Profit, Coberturas, Órdenes)
                await autobotLogic.botCycle(price);
            }
        } catch (e) { 
            // Manejo de errores silencioso para protocolos WS
        }
    });

    marketWs.on('close', () => {
        console.log("⚠️ [MARKET_WS] Cerrado. Reconectando en 2s...");
        if (marketHeartbeat) clearInterval(marketHeartbeat);
        setTimeout(() => setupMarketWS(io), 2000);
    });

    marketWs.on('error', (err) => {
        console.error("❌ [MARKET_WS] Error:", err.message);
    });
}

// --- WEBSOCKET BITMART (ÓRDENES PRIVADAS) ---
bitmartService.initOrderWebSocket((ordersData) => {
    io.sockets.emit('open-orders-update', ordersData);
});

// --- BUCLES DE SINCRONIZACIÓN (SALDOS) ---
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

// --- ARRANQUE ---
setupMarketWS(io);

io.on('connection', (socket) => {
    console.log(`👤 Usuario conectado: ${socket.id}`);
    Autobot.findOne({}).lean().then(state => {
        if (state) emitBotState(io, state);
    });
});

server.listen(PORT, () => {
    console.log(`🚀 SERVIDOR ACTIVO EN PUERTO: ${PORT}`);
});