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
const MarketSignal = require('./models/MarketSignal'); // El modelo que creamos arriba

const analyzer = require('./src/bitmart_indicator_analyzer'); // Tu analizador de RSI

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

// --- LÓGICA DE EMISIÓN DE ESTADO (CORREGIDA PARA VER TODOS LOS DATOS) ---
const emitBotState = (io, state) => {
    if (!state) return;

    // 1. Cálculo de rendimiento para las flechas
    const totalCurrentBalance = (state.lbalance || 0) + (state.sbalance || 0);
    const profitPercent = totalCurrentBalance > 0 
        ? ((state.total_profit || 0) / totalCurrentBalance) * 100 
        : 0;

    // 2. ENVIAR TODO (Esto quita los ceros del Dashboard)
    io.sockets.emit('bot-state-update', {
        // Estados
        lstate: state.lstate,
        sstate: state.sstate,
        
        // Dinero
        total_profit: state.total_profit,
        lbalance: state.lbalance,
        sbalance: state.sbalance,
        lprofit: state.lprofit,
        sprofit: state.sprofit,
        lastAvailableUSDT: state.lastAvailableUSDT,

        // Precios Objetivo (Los que estaban en 0)
        ltprice: state.ltprice, // Target Price Long
        stprice: state.stprice, // Target Price Short
        lsprice: state.lsprice, // Stop/Trailing Price Long
        sbprice: state.sbprice, // Stop/Trailing Price Short
        
        // Ciclos y Cobertura
        lcycle: state.lcycle,
        scycle: state.scycle,
        lcoverage: state.lcoverage,
        scoverage: state.scoverage,
        lnorder: state.lnorder,
        snorder: state.snorder
    });

    // 3. Mantener bot-stats para compatibilidad
    io.sockets.emit('bot-stats', {
        totalProfit: state.total_profit || 0,
        profitChangePercent: profitPercent 
    });
};

// --- ACTUALIZACIÓN DE ESTADO POR PRECIO (TICKER) ---
async function updateBotStateWithPrice(price) {
    try {
        const botState = await Autobot.findOne({}).lean();
        const currentPrice = parseFloat(price);
        if (!botState || isNaN(currentPrice) || currentPrice <= 0) return;

        const FEE_RATE = botState.config?.long?.feeRate || 0.001; 

        // 1. Cálculo Profit LONG
        const lprofit = calculatePotentialProfit(
            botState.lStateData?.ppc || 0, 
            botState.lStateData?.ac || 0, 
            currentPrice, 
            FEE_RATE
        );       

        // 2. Cálculo Profit SHORT (Inverso)
        // Nota: En short, el profit es (Entrada - Actual) * Cantidad
        const s_ppc = botState.sStateData?.ppc || 0;
        const s_ac = botState.sStateData?.ac || 0;
        let sprofit = 0;
        if (s_ac > 0) {
            sprofit = (s_ppc - currentPrice) * s_ac;
            const s_fees = (s_ppc * s_ac * FEE_RATE) + (currentPrice * s_ac * FEE_RATE);
            sprofit -= s_fees;
        }

        // Actualizamos la base de datos con ambos
        const updatedBotState = await Autobot.findOneAndUpdate(
            { _id: botState._id },
            { $set: { lprofit, sprofit, lastUpdateTime: new Date() } },
            { new: true, lean: true }
        );       

        if (updatedBotState) emitBotState(io, updatedBotState);
    } catch (error) {
        console.error('Error al actualizar con precio:', error);
    }
}

let lastProcessedMinute = -1; // Para saber cuándo ya calculamos el RSI de este minuto

// --- WEBSOCKET BITMART (PRECIOS Y MARKET DATA) ---
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
                const ticker = parsed.data[0];
                const price = parseFloat(ticker.last_price);
                
                // --- CÁLCULO DE CAMBIO PORCENTUAL (Asegúrate de tener esto arriba) ---
                const open24h = parseFloat(ticker.open_24h);
                const priceChangePercent = open24h > 0 ? ((price - open24h) / open24h) * 100 : 0;

                // --- LÓGICA DE ANÁLISIS GLOBAL (Cada minuto) ---
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
                    console.log(`[GLOBAL-ANALYZER] DB actualizada: RSI ${analysis.currentRSI}`);
                }

                // --- ESTA ES LA LÍNEA QUE CORREGIMOS ---
                io.emit('marketData', { price, priceChangePercent });
                
                await updateBotStateWithPrice(price);
                await autobotLogic.botCycle(price);
            }
        } catch (e) { console.error("Error en el ciclo global:", e); }
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

//setInterval(async () => {
//    try {
//        const openOrders = await bitmartService.getOpenOrders('BTC_USDT');
//        if (openOrders) io.sockets.emit('open-orders-update', openOrders);
//    } catch (e) { console.error("Error Polling Orders:", e.message); }
//}, 5000);

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
    checkTimeSync();
});