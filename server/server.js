// server/server.js
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http'); // Import http for Socket.IO
const socketIo = require('socket.io'); // Import socket.io

require('dotenv').config(); // Load environment variables from .env (for local dev)

const app = express();
const server = http.createServer(app); // Create HTTP server for Socket.IO

// --- Configuración de CORS para Socket.IO y Express ---
// Se recomienda usar process.env.FRONTEND_URL para el dominio en producción
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000"; // Fallback para desarrollo local

const io = new socketIo.Server(server, { // Initialize Socket.IO server
    cors: {
        origin: FRONTEND_URL, // <--- Aquí va la URL exacta de tu frontend en Vercel
        methods: ["GET", "POST"],
        credentials: true
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
const autobotLogic = require('./autobotLogic');
const bitmartService = require('./services/bitmartService'); // Asegúrate de importar bitmartService aquí
// Importar los middlewares necesarios
const { authenticateToken } = require('./controllers/userController'); 
const bitmartAuthMiddleware = require('./middleware/bitmartAuthMiddleware'); 

// Inyectar la instancia de io en la lógica del bot
autobotLogic.setIoInstance(io);

// Define el puerto del servidor. Usa process.env.PORT para producción en Render.
const port = process.env.PORT || 3001; 

// --- Conectar a MongoDB ---
mongoose
    .connect(process.env.MONGO_URI, { // <-- Aquí es donde MONGO_URI se usa
        dbName: 'bsb',
    })
    .then(async () => {
        console.log('✅ Conectado a MongoDB correctamente');
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
app.use('/api/auth', authRoutes); 
app.use('/api/user', userRoutes); 

// --- NUEVO ENDPOINT: Obtener Hora del Servidor BitMart (Público) ---
// Este endpoint debe estar en server.js o en userRoutes.js. Si ya lo tienes en userRoutes.js,
// asegúrate de que userRoutes esté importado y usado correctamente.
// Si lo quieres aquí en server.js directamente, así sería:
app.get('/api/bitmart/system-time', async (req, res) => {
    try {
        // Llama directamente a la función del servicio BitMart
        const serverTime = await bitmartService.getSystemTime(); 
        res.json({ server_time: serverTime });
    } catch (error) {
        console.error('Error al obtener la hora del servidor de BitMart desde el backend:', error.message);
        res.status(500).json({ message: 'Error interno del servidor al obtener la hora del sistema BitMart.', error: error.message });
    }
});


// --- Endpoints Específicos del Bot/BitMart (AHORA CON AUTENTICACIÓN Y ESTADO POR USUARIO) ---

// Endpoint para obtener el estado del bot (para que el frontend lo muestre)
app.get('/api/user/bot-state', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const botState = await autobotLogic.loadBotStateForUser(userId);
        res.json({ ...botState.toObject() }); 
    } catch (error) {
        console.error('[SERVER] Error al obtener el estado del bot para el usuario:', error);
        res.status(500).json({ message: 'Error al obtener el estado del bot.' });
    }
});

// Endpoint para INICIAR/DETENER el bot
app.post('/api/user/toggle-bot', authenticateToken, bitmartAuthMiddleware, async (req, res) => {
    const { action, params } = req.body;
    const userId = req.user.id;
    const bitmartCreds = req.bitmartAuth; // Usar req.bitmartAuth que es lo que adjunta el middleware

    console.log(`[SERVER] Recibida solicitud para /api/user/toggle-bot para usuario ${userId}. Action: ${action}, Params:`, params);

    try {
        let result;
        if (action === 'start') {
            result = await autobotLogic.startBotStrategy(userId, params, bitmartCreds);
        } else if (action === 'stop') {
            const botState = await autobotLogic.loadBotStateForUser(userId);
            result = await autobotLogic.stopBotStrategy(botState, bitmartCreds);
        } else {
            console.error(`[SERVER] Acción inválida recibida para usuario ${userId}:`, action);
            const currentBotState = await autobotLogic.loadBotStateForUser(userId);
            return res.status(400).json({ success: false, message: 'Invalid action. Use "start" or "stop".', botState: { ...currentBotState.toObject() } });
        }
        res.json(result);

    } catch (error) {
        console.error(`[SERVER] Error al manejar la solicitud de toggle-bot para usuario ${userId}:`, error);
        const currentBotState = await autobotLogic.loadBotStateForUser(userId); 
        res.status(500).json({ success: false, message: `Server error: ${error.message || 'Unknown error'}`, botState: { ...currentBotState.toObject() } });
    }
});

// --- Iniciar el servidor HTTP y Socket.IO ---
server.listen(port, () => {
    console.log(`🚀 Backend server running on http://localhost:${port}`);
});

// --- Manejo de apagado para limpiar el intervalo ---
process.on('SIGINT', async () => {
    console.log('\n[SERVER] Señal de apagado recibida. Intentando detener todos los bots activos y guardar estados...');
    console.log('[SERVER] Los bots se marcarán como STOPPED al próximo inicio. Apagando servidor.');
    process.exit(0);
});