// server/server.js
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http'); // Import http for Socket.IO
const { Server } = require('socket.io'); // Import Server from socket.io

require('dotenv').config(); // Load environment variables from .env

const app = express();
const server = http.createServer(app); // Create HTTP server for Socket.IO

// --- Configuración de CORS para Socket.IO y Express ---
const FRONTEND_URL = process.env.FRONTEND_URL || "https://bsb-lime.vercel.app";

const io = new Server(server, { // Initialize Socket.IO server
    cors: {
        origin: FRONTEND_URL, // <-- Aquí va la URL exacta de tu frontend en Vercel
        methods: ["GET", "POST"]
    }
});

// Middleware CORS para Express
app.use(cors({
    origin: FRONTEND_URL, // <-- Aquí también va la URL exacta de tu frontend en Vercel
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    optionsSuccessStatus: 204
}));

app.use(express.json()); // Middleware para parsear el cuerpo de las solicitudes JSON


// --- Importaciones de Módulos y Servicios ---
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const BotState = require('./models/BotState'); // Importar el modelo BotState

// Importar la lógica del bot
const autobotLogic = require('./autobotLogic');
// Importar middleware de autenticación para proteger rutas del bot
const authMiddleware = require('./middleware/authMiddleware');

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
        // Cargar el estado del bot desde la base de datos al iniciar el servidor
        await autobotLogic.loadBotStateFromDB();
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
app.use('/api/user', userRoutes); // Prefijo para rutas de usuario (como guardar API keys, obtener balance específico del usuario)

// --- Endpoints Específicos del Bot (PROTEGIDOS POR AUTHENTICACIÓN) ---
// Nota: Las rutas como /api/balance, /api/open-orders, etc. que estaban sin prefijo y sin autenticación
// han sido eliminadas para evitar confusión y problemas de seguridad.
// Se recomienda usar las rutas ya definidas en userRoutes (ej. /api/user/bitmart/balance)
// que ya incluyen el middleware de autenticación del usuario.

// Endpoint para obtener el estado del bot (para que el frontend lo muestre)
// PROTEGIDA POR AUTHENTICATION
app.get('/api/bot-state', authMiddleware, async (req, res) => {
    try {
        // En un entorno multi-usuario, podrías querer cargar el estado del bot específico para req.user.id
        // Si DEFAULT_BOT_USER_ID en autobotLogic.js es fijo para un solo bot, asegúrate que se corresponda
        // con el ID del usuario actual o de un usuario de prueba para fines de demostración.
        const botStateForUser = await BotState.findOne({ userId: req.user.id }); // Cargar el estado del bot para el usuario autenticado

        if (botStateForUser) {
            // Enviar una COPIA del botState para evitar modificar el original fuera de la lógica del bot
            const stateToEmit = botStateForUser.toObject();
            delete stateToEmit.strategyIntervalId; // Asegúrate de no enviar esto
            res.json(stateToEmit);
        } else {
            // Si no hay estado guardado para este usuario, envía un estado por defecto (detenido)
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
        console.error('Error al obtener el estado del bot para el usuario:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor al obtener el estado del bot.' });
    }
});


// Endpoint para INICIAR/DETENER el bot (PROTEGIDO POR AUTHENTICACIÓN)
app.post('/api/toggle-bot', authMiddleware, async (req, res) => {
    const { action, params } = req.body;

    console.log(`[SERVER] Recibida solicitud para /api/toggle-bot. Action: ${action}, Params:`, params);

    try {
        let result;
        if (action === 'start') {
            // Asegúrate de que los 'params' sean los esperados por 'startBotStrategy'
            // El frontend envía: { purchase, increment, decrement, trigger, stopAtCycleEnd }
            // autobotLogic espera: { purchaseAmount, incrementPercentage, decrementPercentage, triggerPercentage, stopOnCycleEnd }
            const formattedParams = {
                purchaseAmount: parseFloat(params.purchase),
                incrementPercentage: parseFloat(params.increment),
                decrementPercentage: parseFloat(params.decrement),
                triggerPercentage: parseFloat(params.trigger),
                stopOnCycleEnd: typeof params.stopAtCycleEnd === 'boolean' ? params.stopAtCycleEnd : false // Asegura el tipo
            };

            result = await autobotLogic.startBotStrategy(formattedParams);

        } else if (action === 'stop') {
            result = await autobotLogic.stopBotStrategy();
        } else {
            console.error('[SERVER] Acción inválida recibida:', action);
            return res.status(400).json({ success: false, message: 'Invalid action. Use "start" or "stop".', botState: { ...autobotLogic.botState } });
        }
        
        // El resultado ya contiene 'success', 'message' y 'botState'
        // Simplemente reenviamos la respuesta de autobotLogic.
        res.json(result);

    } catch (error) {
        console.error('[SERVER] Error al manejar la solicitud de toggle-bot:', error);
        res.status(500).json({ success: false, message: `Server error: ${error.message || 'Unknown error'}`, botState: { ...autobotLogic.botState } });
    }
});

// Servir archivos estáticos (tu frontend) - Asegúrate de que 'public' sea la ruta correcta a tu frontend build
app.use(express.static('public'));

// --- Iniciar el servidor HTTP y Socket.IO ---
server.listen(port, () => {
    console.log(`🚀 Backend server running on http://localhost:${port}`);
});

// --- Manejo de apagado para limpiar el intervalo ---
process.on('SIGINT', async () => {
    console.log('\n[AUTOBOT] Señal de apagado recibida. Deteniendo bot y guardando estado...');
    // Asegurarse de que el botState esté actualizado antes de detener y guardar
    await autobotLogic.stopBotStrategy(); // Esto ya pone el estado en STOPPED y guarda
    console.log('[AUTOBOT] Bot detenido y estado guardado. Apagando servidor.');
    process.exit(0);
});