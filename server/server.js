// server/server.js
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http'); // Import http for Socket.IO
const socketIo = require('socket.io'); // Import socket.io

require('dotenv').config(); // Load environment variables from .env

const app = express();
const server = http.createServer(app); // Create HTTP server for Socket.IO

// --- Configuración de CORS para Socket.IO y Express ---
const FRONTEND_URL = process.env.FRONTEND_URL || "https://bsb-lime.vercel.app";

const io = new socketIo.Server(server, { // Initialize Socket.IO server
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
const autobotLogic = require('./autobotLogic');
// Importar los middlewares necesarios
const { authenticateToken } = require('./controllers/userController'); // Usamos authenticateToken del userController
const bitmartAuthMiddleware = require('./middleware/bitmartAuthMiddleware'); // Importar el middleware BitMart

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
        // NOTA: Eliminamos la llamada a `autobotLogic.loadBotStateFromDB()` aquí
        // porque la carga del estado ahora se hace por usuario, bajo demanda,
        // al iniciar o consultar el bot.
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


// --- Endpoints Específicos del Bot/BitMart (AHORA CON AUTENTICACIÓN Y ESTADO POR USUARIO) ---

// Endpoint para obtener el estado del bot (para que el frontend lo muestre)
// Ahora protegido y carga el estado específico del usuario
app.get('/api/user/bot-state', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        // Cargar el estado del bot para el usuario autenticado
        const botState = await autobotLogic.loadBotStateForUser(userId);
        res.json({ ...botState.toObject() }); // Enviar una copia plana del objeto Mongoose
    } catch (error) {
        console.error('[SERVER] Error al obtener el estado del bot para el usuario:', error);
        res.status(500).json({ message: 'Error al obtener el estado del bot.' });
    }
});

// Endpoint para INICIAR/DETENER el bot
// Ahora protegido y maneja el estado y credenciales por usuario
app.post('/api/user/toggle-bot', authenticateToken, bitmartAuthMiddleware, async (req, res) => {
    const { action, params } = req.body;
    const userId = req.user.id;
    // req.bitmartCreds contiene { apiKey, secretKey (desencriptada), apiMemo }
    const bitmartCreds = req.bitmartCreds; 

    console.log(`[SERVER] Recibida solicitud para /api/user/toggle-bot para usuario ${userId}. Action: ${action}, Params:`, params);

    try {
        let result;
        if (action === 'start') {
            result = await autobotLogic.startBotStrategy(userId, params, bitmartCreds);
        } else if (action === 'stop') {
            // Antes de detener, carga el estado del bot para asegurar que estás deteniendo el correcto
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
        const currentBotState = await autobotLogic.loadBotStateForUser(userId); // Intenta cargar el estado actual para devolverlo
        res.status(500).json({ success: false, message: `Server error: ${error.message || 'Unknown error'}`, botState: { ...currentBotState.toObject() } });
    }
});


// Las rutas /api/balance, /test-balance, /api/open-orders, /test-open-orders, /api/history-orders
// se consideran obsoletas o duplicadas, ya que ahora la funcionalidad
// equivalente está disponible bajo /api/user/* con autenticación.
// Se han eliminado para evitar confusiones y asegurar el uso de las rutas autenticadas.


// --- Iniciar el servidor HTTP y Socket.IO ---
server.listen(port, () => {
    console.log(`🚀 Backend server running on http://localhost:${port}`);
});

// --- Manejo de apagado para limpiar el intervalo ---
process.on('SIGINT', async () => {
    console.log('\n[SERVER] Señal de apagado recibida. Intentando detener todos los bots activos y guardar estados...');
    // Cuando el servidor se apaga, no hay un `req.user.id` o `req.bitmartCreds` disponible.
    // Aquí es donde tendrías que iterar sobre todos los estados de bot en la DB
    // que estén en `RUNNING` o `BUYING` o `SELLING`, y detenerlos individualmente.
    // Por simplicidad en este ejemplo, no se implementa una lógica compleja de apagado de todos los bots.
    // Los bots se marcarán como STOPPED al cargarse la próxima vez (ver `loadBotStateForUser`).
    console.log('[SERVER] Los bots se marcarán como STOPPED al próximo inicio. Apagando servidor.');
    process.exit(0);
});
