// server/server.js
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http'); // Import http for Socket.IO
const { Server } = require('socket.io'); // Import Server from socket.io
const path = require('path'); // NEW: Import path module for serving static files

require('dotenv').config(); // Load environment variables from .env

const app = express();
const server = http.createServer(app); // Create HTTP server for Socket.IO

// --- Configuración de CORS para Socket.IO y Express ---
const FRONTEND_URL = process.env.FRONTEND_URL || "https://bsb-lime.vercel.app";

const io = new Server(server, { // Initialize Socket.IO server
    cors: {
        origin: FRONTEND_URL, // <--- Aquí va la URL exacta de tu frontend en Vercel
        methods: ["GET", "POST"]
    }
});

// Middleware CORS para Express
app.use(cors({
    origin: FRONTEND_URL, // <--- Aquí también va la URL exacta de tu frontend en Vercel
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    optionsSuccessStatus: 204
}));

app.use(express.json()); // Middleware para parsear el cuerpo de las solicitudes JSON


// --- Importaciones de Módulos y Servicios ---
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const BotState = require('./models/BotState');

// Importar la lógica del bot
const autobotLogic = require('./autobotLogic');
// Importar middleware de autenticación para proteger rutas del bot
const authMiddleware = require('./middleware/authMiddleware'); // DESCOMENTADO

// Inyectar la instancia de io en la lógica del bot
autobotLogic.setIoInstance(io);

// Define el puerto del servidor. Usa process.env.PORT para producción en Render.
const port = process.env.PORT || 3001; // Usar el puerto de Render si está disponible, sino 3001

// --- Conectar a MongoDB ---
mongoose
    .connect(process.env.MONGO_URI, {
        dbName: 'bsb',
    })
    .then(async () => {
        console.log('✅ Conectado a MongoDB correctamente');
        // Cargar el estado del bot por defecto o el último estado global al iniciar el servidor
        await autobotLogic.loadBotStateFromDB(); // Esta carga el estado por DEFAULT_BOT_USER_ID
    })
    .catch((error) => {
        console.error('❌ Error conectando a MongoDB:', error.message);
        process.exit(1); // Salir del proceso si la conexión a la DB falla
    });

// --- Rutas de la API ---
// Endpoint para el "ping" (verificación de conexión)
app.get('/ping', (req, res) => {
    res.json({ status: 'ok', message: 'Backend is running!' });
});

// Usar las rutas importadas
app.use('/api/auth', authRoutes); // Prefijo para rutas de autenticación (login, registro)
app.use('/api/user', userRoutes); // Prefijo para rutas de usuario (ej. guardar API keys, obtener balance)


// --- Endpoints Específicos del Bot (PROTEGIDOS POR AUTENTICACIÓN) ---
// Endpoint para obtener el estado del bot (para que el frontend lo muestre)
app.get('/api/bot-state', authMiddleware, async (req, res) => { // authMiddleware APLICADO
    try {
        // Carga el estado del bot específico para el usuario autenticado
        const botStateForUser = await autobotLogic.getBotStateForUser(req.user.id);

        if (botStateForUser) {
            // Enviamos un objeto plano para evitar problemas de serialización
            const stateToEmit = botStateForUser;
            delete stateToEmit.strategyIntervalId; // Asegúrate de no enviar esto
            res.json(stateToEmit);
        } else {
            // Si no hay estado guardado para este usuario, envía un estado por defecto (detenido)
            // Usa los valores por defecto definidos en autobotLogic o un BotState nuevo
            res.json({
                userId: req.user.id,
                state: 'STOPPED',
                cycle: 0,
                profit: 0,
                cycleProfit: 0,
                currentPrice: 0,
                purchaseAmount: 0,
                incrementPercentage: 0,
                decrementPercentage: 0,
                triggerPercentage: 0,
                ppc: 0,
                cp: 0,
                ac: 0,
                pm: 0,
                pv: 0,
                pc: 0,
                lastOrder: null,
                openOrders: [],
                orderCountInCycle: 0,
                lastOrderUSDTAmount: 0,
                nextCoverageUSDTAmount: 0,
                nextCoverageTargetPrice: 0,
                stopOnCycleEnd: false
            });
        }
    } catch (error) {
        console.error('Error al obtener el estado del bot para el usuario:', error.message);
        res.status(500).json({ success: false, message: 'Error interno del servidor al obtener el estado del bot.', error: error.message });
    }
});

// Endpoint para INICIAR/DETENER el bot
app.post('/api/toggle-bot', authMiddleware, async (req, res) => { // authMiddleware APLICADO
    const { action, params } = req.body;
    const userId = req.user.id; // Obtener userId del usuario autenticado

    console.log(`[SERVER] Recibida solicitud para /api/toggle-bot (user: ${userId}). Action: ${action}, Params:`, params);

    try {
        let result;
        if (action === 'start') {
            const formattedParams = {
                purchaseAmount: parseFloat(params.purchase),
                incrementPercentage: parseFloat(params.increment),
                decrementPercentage: parseFloat(params.decrement),
                triggerPercentage: parseFloat(params.trigger),
                stopOnCycleEnd: typeof params.stopOnCycleEnd === 'boolean' ? params.stopOnCycleEnd : false
            };
            // Pasa el userId a la función startBotStrategy
            result = await autobotLogic.startBotStrategy(userId, formattedParams);

        } else if (action === 'stop') {
            // Pasa el userId a la función stopBotStrategy
            result = await autobotLogic.stopBotStrategy(userId);
        } else {
            console.error('[SERVER] Acción inválida recibida:', action);
            return res.status(400).json({ success: false, message: 'Invalid action. Use "start" or "stop".', botState: { ...(await autobotLogic.getBotStateForUser(userId)) } });
        }
        
        res.json(result);

    } catch (error) {
        console.error('[SERVER] Error al manejar la solicitud de toggle-bot:', error.message);
        res.status(500).json({ success: false, message: `Server error: ${error.message || 'Unknown error'}`, botState: { ...(await autobotLogic.getBotStateForUser(userId)) } });
    }
});

// NEW: Ruta para servir la librería cliente de Socket.IO explícitamente
// Esto debe ir ANTES de app.use(express.static('public')) para tener precedencia
app.get('/socket.io/socket.io.js', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../node_modules/socket.io/client-dist/socket.io.js'));
});

// Servir archivos estáticos (tu frontend) - Asegúrate de que 'public' es la ruta correcta a tu frontend build
app.use(express.static('public'));


// --- Iniciar el servidor HTTP y Socket.IO ---
server.listen(port, () => {
    console.log(`🚀 Backend server running on http://localhost:${port}`);
});

// --- Manejo de apagado para limpiar el intervalo ---
process.on('SIGINT', async () => {
    console.log('\n[AUTOBOT] Señal de apagado recibida. Deteniendo bot y guardando estado...');
    // Al apagar, podemos detener el bot global o asumir que los bots de usuario se gestionan por separado
    // Para simplificar, si no hay un userId en este contexto, usamos el default.
    await autobotLogic.stopBotStrategy(autobotLogic.botState.userId); // Asumiendo que esta detención global es aceptable
    console.log('[AUTOBOT] Bot detenido y estado guardado. Apagando servidor.');
    process.exit(0);
});