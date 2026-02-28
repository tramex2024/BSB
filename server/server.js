/**
 * BSB/server/server.js
 * SERVIDOR UNIFICADO (BSB 2026) - Versión Refactorizada y Modular
 */

const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const cron = require('node-cron');

// --- 1. IMPORTACIÓN DE SERVICIOS Y LÓGICA ---
const autobotLogic = require('./autobotLogic.js');
const centralAnalyzer = require('./services/CentralAnalyzer'); 
const aiEngine = require(path.join(__dirname, 'src', 'ai', 'AIEngine')); 
const orderPersistenceService = require('./services/orderPersistenceService');
const marketService = require('./services/marketService');
const cronService = require('./services/cronService');

// Modelos (Solo los necesarios para tareas globales en server.js)
const User = require('./models/User');

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

// Inyectar IO en los motores lógicos
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
app.use('/api', require('./routes/serviceRoutes'));

// Cargar rutas de Admin inyectando el objeto 'io'
const adminRoutes = require('./routes/adminRoutes')(io);
app.use('/api/admin', adminRoutes);

// --- 5. TAREAS PROGRAMADAS GLOBALES (CRON) ---
// REVISIÓN DE EXPIRACIÓN DE PLANES (Cada hora)
cron.schedule('0 * * * *', async () => {
    try {
        const now = new Date();
        const result = await User.updateMany(
            { 
                role: 'advanced', 
                roleExpiresAt: { $lt: now } 
            },
            { 
                $set: { role: 'current', roleExpiresAt: null } 
            }
        );
        if (result.modifiedCount > 0) {
            console.log(`[AUTO-CLEANUP] ${result.modifiedCount} usuarios regresaron a 'current' por expiración.`);
        }
    } catch (error) {
        console.error("[CRON-ERROR] Error en limpieza de roles:", error);
    }
});

// --- 6. CONEXIÓN BASE DE DATOS Y ARRANQUE DE SERVICIOS ---
mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log('✅ MongoDB Connected...');
        
        // A. Cargar Gestor de Sockets (Salas, Historial, Notificaciones)
        require('./services/socketManager')(io);
        
        // B. Arrancar el ticker público (Precio BTC en tiempo real)
        marketService.setupPublicTicker(io);
        
        // C. Arrancar los sockets privados (Monitoreo de órdenes BitMart)
        await marketService.initializePrivateWebSockets(io, orderPersistenceService);
       
        // D. Iniciar tareas programadas de fondo (Balances y Sincronización)
        cronService.startCronJobs(io);
    })
    .catch(err => {
        console.error('❌ Error Crítico de Conexión MongoDB:', err.message);
    });

// --- 7. ARRANQUE DEL SERVIDOR ---
server.listen(PORT, async () => {
    try {
        // Inicializar el analizador central con el objeto IO
        centralAnalyzer.init(io); 
        console.log("🧠 [IA-CORE] Motor de análisis sincronizado.");
    } catch (e) { 
        console.error("❌ Error en inicialización de Analizador:", e.message); 
    }
    console.log(`🚀 SERVIDOR BSB 2026 ACTIVO EN PUERTO: ${PORT}`);
});