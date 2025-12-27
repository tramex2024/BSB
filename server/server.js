// BSB/server/server.js
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
const checkTimeSync = require('./services/check_time');

// Importa las funciones de cálculo
const { calculateLongCoverage, calculatePotentialProfit } = require('./autobotCalculations');

// Modelos
const Autobot = require('./models/Autobot');

// Routers
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const ordersRoutes = require('./routes/ordersRoutes');
const autobotRoutes = require('./routes/autobotRoutes');
const configRoutes = require('./routes/configRoutes');
const balanceRoutes = require('./routes/balanceRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');

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

// --- MIDDLEWARES ---
app.use(cors());
app.use(express.json());

// --- RUTAS ---
app.use('/api/auth', authRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/users', userRoutes);
app.use('/api/autobot', autobotRoutes);
app.use('/api/v1/config', configRoutes);
app.use('/api/v1/bot-state', balanceRoutes);
app.use('/api/v1/analytics', analyticsRoutes);

// --- CONEXIÓN DB ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected...'))
    .catch(err => console.error('❌ MongoDB Error:', err));

// --- LÓGICA DE EMISIÓN DE ESTADO (MEJORADA PARA DASHBOARD) ---
const emitBotState = (io, state) => {
    // Este evento alimenta directamente a tu dashboard.js
    io.sockets.emit('bot-state-update', {
        lstate: state.lstate || 'STOPPED',
        sstate: state.sstate || 'STOPPED',
        total_profit: state.total_profit || 0,
        lbalance: state.lbalance || 0,
        sbalance: state.sbalance || 0,
        lcycle: state.lcycle || 0,
        scycle: state.scycle || 0,
        lcoverage: state.lcoverage || 0, 
        scoverage: state.scoverage || 0,
        lnorder: state.lnorder || 0,
        snorder: state.snorder || 0,
        lprofit: state.lprofit || 0,
        // Agregamos datos extra para que el frontend no tenga que pedirlos por separado
        lastAvailableUSDT: state.lastAvailableUSDT || 0
    });
};

// --- ACTUALIZACIÓN DE ESTADO POR PRECIO (TICKER) ---
async function updateBotStateWithPrice(price) {
    try {
        const botState = await Autobot.findOne({}).lean();
        const currentPrice = parseFloat(price);
        if (!botState || isNaN(currentPrice) || currentPrice <= 0) return;

        const FEE_RATE = botState.config?.long?.feeRate || 0.001; 
        const lprofit = calculatePotentialProfit(
            botState.lStateData?.ppc || 0, 
            botState.lStateData?.ac || 0, 
            currentPrice, 
            FEE_RATE 
        );       

        const updateData = { lprofit, lastUpdateTime: new Date() };

        // Recalcular cobertura dinámicamente
        if (['STOPPED', 'NO_COVERAGE'].includes(botState.lstate)) {            
            const { coveragePrice: lcoverage, numberOfOrders: lnorder } = calculateLongCoverage(
                botState.lbalance,
                currentPrice,
                botState.config.long.purchaseUsdt,
                botState.config.long.price_var / 100,
                botState.config.long.size_var / 100,
                botState.lStateData?.orderCountInCycle || 0
            );
            updateData.lcoverage = lcoverage;
            updateData.lnorder = lnorder;
        }

        const updatedBotState = await Autobot.findOneAndUpdate(
            { _id: botState._id },
            { $set: updateData },
            { new: true, lean: true }
        );       

        if (updatedBotState) emitBotState(io, updatedBotState);
    } catch (error) {
        console.error('Error al actualizar con precio:', error);
    }
}

// --- WEBSOCKET BITMART (PRECIOS) ---
const bitmartWsUrl = 'wss://ws-manager-compress.bitmart.com/api?protocol=1.1&compression=true';
function setupMarketWS(io) {
    const ws = new WebSocket(bitmartWsUrl);
    
    ws.on('open', () => {
        console.log("📡 WebSocket BitMart: Market Data Conectado.");
        ws.send(JSON.stringify({ "op": "subscribe", "args": ["spot/ticker:BTC_USDT"] }));
    });

    ws.on('message', async (data) => {
        try {
            const parsed = JSON.parse(data);
            if (parsed.data && parsed.data[0]?.symbol === 'BTC_USDT') {
                const price = parsed.data[0].last_price;
                // Emitir precio para el display "auprice"
                io.emit('marketData', { price });
                
                await updateBotStateWithPrice(price);
                
                // Ejecutar ciclo lógico principal
                await autobotLogic.botCycle(price);
            }
        } catch (e) { console.error("Error Market WS Message:", e); }
    });

    ws.on('close', () => {
        console.log("⚠️ Market WS Cerrado. Reintentando...");
        setTimeout(() => setupMarketWS(io), 5000);
    });
}

// --- WEBSOCKET BITMART (ÓRDENES PRIVADAS) ---
bitmartService.initOrderWebSocket((ordersData) => {
    console.log(`[WS-Private] Actualización de ${ordersData.length} órdenes.`);
    io.sockets.emit('open-orders-update', ordersData);
});

// --- BUCLES DE SINCRONIZACIÓN (INTERVALS) ---

// 1. Sincronización de Balances Reales (Cada 10s)
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

// 2. Polling de Seguridad para Órdenes Abiertas (Cada 5s)
setInterval(async () => {
    try {
        const openOrders = await bitmartService.getOpenOrders('BTC_USDT');
        if (openOrders) io.sockets.emit('open-orders-update', openOrders);
    } catch (e) { console.error("Error Polling Orders:", e.message); }
}, 5000);

// --- ARRANQUE ---
setupMarketWS(io);

io.on('connection', (socket) => {
    console.log(`👤 Usuario conectado: ${socket.id}`);
    
    // Al conectarse, enviamos el estado actual inmediatamente
    Autobot.findOne({}).lean().then(state => {
        if (state) emitBotState(io, state);
    });
});

server.listen(PORT, () => {
    console.log(`🚀 SERVIDOR ACTIVO EN PUERTO: ${PORT}`);
    checkTimeSync();
});