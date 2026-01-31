// BSB/server/server.js

const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

// --- 1. IMPORTACIÓN DE SERVICIOS Y LÓGICA ---
const bitmartService = require('./services/bitmartService');
const autobotLogic = require('./autobotLogic.js');
const centralAnalyzer = require('./services/CentralAnalyzer'); 
const MarketWorker = require('./workers/MarketWorker');

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

// Compartir io globalmente para los Workers
global.io = io;

// --- 4. RUTAS API ---
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/orders', require('./routes/ordersRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/autobot', require('./routes/autobotRoutes'));
app.use('/api/v1/config', require('./routes/configRoutes'));
app.use('/api/v1/balance', require('./routes/balanceRoutes'));
app.use('/api/v1/analytics', require('./routes/analyticsRoutes'));
app.use('/api/ai', require('./routes/aiRoutes'));

// --- 5. CONEXIÓN BASE DE DATOS Y ARRANQUE DE MOTORES ---
mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log('✅ MongoDB Connected (BSB 2026)...');
        
        // --- 6. INICIALIZACIÓN DE MOTORES CENTRALIZADOS ---
        // El MarketWorker ahora es el ÚNICO que consulta precios públicos
        MarketWorker.start();
        
        // Inicializamos CentralAnalyzer para indicadores globales
        centralAnalyzer.init(io);

        // Inicializamos la IA cargando su memoria de la DB
        await aiEngine.init(io);
        
        // Inicializamos la lógica del bot real
        autobotLogic.setIo(io);

        console.log("🧠 [MOTORES] Todos los servicios iniciados y sincronizados.");
    })
    .catch(err => console.error('❌ MongoDB Error:', err));

// --- 7. WS ÓRDENES PRIVADAS (Solo para ejecución real) ---
bitmartService.initOrderWebSocket((ordersData) => {
    io.sockets.emit('open-orders-update', ordersData);
});

// --- 8. BUCLE DE SALDOS (Optimizado cada 10s) ---
setInterval(async () => {
    try {
        if (mongoose.connection.readyState === 1) {
            await autobotLogic.slowBalanceCacheUpdate();
        }
    } catch (e) { console.error("Error Balance Loop:", e); }
}, 10000);

// --- 9. EVENTOS SOCKET.IO PARA CLIENTES ---
io.on('connection', async (socket) => {
    console.log(`👤 Usuario Conectado: ${socket.id}`);

    // Función para enviar estado unificado de la IA
    const sendAiStatus = async () => {
        try {
            const statusData = {
                isRunning: aiEngine.isRunning,
                virtualBalance: aiEngine.virtualBalance,
                historyCount: aiEngine.history ? aiEngine.history.length : 0,
                lastEntryPrice: aiEngine.lastEntryPrice,
                highestPrice: aiEngine.highestPrice
            };
            socket.emit('ai-status-update', statusData);
            socket.emit('ai-status-init', statusData); 
        } catch (err) { console.error("❌ Error enviando status IA:", err); }
    };

    // Al conectar, enviamos el estado actual
    await sendAiStatus();

    socket.on('get-ai-status', async () => {
        await sendAiStatus();
    });

    socket.on('get-ai-history', async () => {
        try {
            const trades = await AIBotOrder.find({ isVirtual: true })
                .sort({ timestamp: -1 })
                .limit(10);
            socket.emit('ai-history-data', trades);
        } catch (err) { console.error("❌ Error historial:", err); }
    });

    socket.on('disconnect', () => console.log(`👤 Usuario Desconectado: ${socket.id}`));
});

// --- 10. INICIO DEL SERVIDOR ---
server.listen(PORT, () => {
    console.log(`🚀 SERVIDOR BSB ACTIVO: PUERTO ${PORT}`);
    console.log(`🛡️  Arquitectura centralizada: Filtro de IP activado.`);
});