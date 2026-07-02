/**
 * BSB/server/server.js
 * SERVIDOR UNIFICADO (BSB 2026) - Versión Refactorizada, Modular y Tolerante a Fallos
 * Estado: Completamente Auditado y Secuenciado contra condiciones de carrera
 */

const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

dotenv.config();

// --- 1. IMPORTACIÓN DE SERVICIOS Y LÓGICA ---
const autobotLogic = require('./autobotLogic.js');
const centralAnalyzer = require('./services/CentralAnalyzer'); 
const aiEngine = require(path.join(__dirname, 'src', 'states', 'ai', 'AIEngine')); 
const orderPersistenceService = require('./services/orderPersistenceService');
const marketService = require('./services/marketService');
const cronService = require('./services/cronService'); 

//dotenv.config();
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
            callback(new Error('CORS no permitido por la política de seguridad BSB'), false);
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

// Inyectar IO en los motores lógicos principales de forma atómica
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

// Cargar rutas de Admin inyectando de forma segura el objeto 'io'
const adminRoutes = require('./routes/adminRoutes')(io);
app.use('/api/admin', adminRoutes);

// --- 5. CONEXIÓN BASE DE DATOS Y ARRANQUE EN CADENA ---
mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log('✅ [DATABASE] MongoDB Conectado correctamente...');
        
        // A. Gestor de Sockets (Salas, Historial de Notificaciones)
        require('./services/socketManager')(io);
        
        // B. Ticker Público (Precio de BTC en tiempo real)
        marketService.setupPublicTicker(io);
        
        // C. Sockets Privados (BitMart) inicializados de forma asíncrona aislada para no bloquear los flujos internos
        (async () => {
            try {
                console.log('🔌 [EXCHANGE-WS] Sincronizando túneles con BitMart...');
                await marketService.initializePrivateWebSockets(io, orderPersistenceService);
            } catch (wsError) {
                console.error('❌ [EXCHANGE-WS] Error al enlazar sockets de BitMart:', wsError.message);
            }
        })();
       
        // D. Tareas Programadas (Balances, Sincronización, Mantenimiento)
        cronService.startCronJobs(io);

        // E. Inicialización tardía y segura de los núcleos analíticos tras asegurar persistencia
        try {
            centralAnalyzer.init(io); 
            console.log("🧠 [IA-CORE] Motor de análisis unificado y sincronizado con DB.");
        } catch (analyzerError) { 
            console.error("❌ [IA-CORE] Fallo crítico al encender el Analizador Central:", analyzerError.message); 
        }

        // F. Apertura del puerto una vez que las dependencias críticas y modelos de Mongoose están listos
        server.listen(PORT, () => {
            console.log(`🚀 [SERVER-READY] ENTORNO BSB 2026 EMITIENDO EN PUERTO: ${PORT}`);
        });
    })
    .catch(err => {
        console.error('❌ [CRITICAL] Error Fatal de Conexión en MongoDB:', err.message);
        process.exit(1); // Finalizar ejecución para que el orquestador de contenedores actúe
    });

// --- 6. ESCUDO DE PROTECCIÓN GLOBAL (Manejo de Errores Críticos Fuera de Contexto) ---
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ [PROCESO-ALERTA] Promesa no capturada detectada en el servidor:', reason);
    // Espacio reservado para telemetría o alertas internas (ej. Slack/Sentry) sin detener la ejecución
});

process.on('uncaughtException', (error) => {
    console.error('💥 [PROCESO-CRASH] Excepción no controlada en el hilo principal:', error.message);
    console.error(error.stack);
    // Si el error compromete críticamente el estado, se recomienda un cierre controlado, de lo contrario se mitiga en vivo
});