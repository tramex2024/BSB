// server/server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors'); // <-- ¡NUEVA LÍNEA AÑADIDA!
const autobotLogic = require('./autobotLogic'); // Tu lógica del bot
const http = require('http'); // Para Socket.IO
const { Server } = require("socket.io"); // Para Socket.IO

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: ["https://bsb-lime.vercel.app", "http://localhost:3000"], // CORS para Socket.IO
        methods: ["GET", "POST"]
    }
});

// --- Configuración de CORS para Express REST API ---
const corsOptions = {
    // Aquí defines qué dominios están permitidos para acceder a tu backend
    origin: ['https://bsb-lime.vercel.app', 'http://localhost:3000'], // <-- ¡CORRECCIÓN AQUÍ! Las URLs deben ir entre comillas
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE', // Permite estos métodos HTTP
    credentials: true, // Importante si tu app usa cookies o sesiones
    optionsSuccessStatus: 204 // Código de estado para respuestas preflight exitosas
};
app.use(cors(corsOptions)); // <-- ¡Usa el middleware CORS!
// --- Fin de la configuración CORS para Express ---


// Conexión a la base de datos (MongoDB)
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

// Inicializa el estado del bot y Socket.IO
autobotLogic.setIoInstance(io);
autobotLogic.loadBotStateFromDB();

// Middleware para parsear JSON (debe ir después de CORS general, pero antes de rutas)
app.use(express.json());

// --- Tus rutas de la API ---
app.post('/api/toggle-bot', async (req, res) => {
    // console.log(`[SERVER] Recibida solicitud para /api/toggle-bot. Estado actual del bot: ${autobotLogic.botState.state}`);

    const { action, params } = req.body;

    if (action === 'start') {
        // console.log('[SERVER] Solicitud de inicio recibida con params:', params);
        if (autobotLogic.botState.state !== 'STOPPED' && autobotLogic.botState.state !== 'NO_COVERAGE') {
            console.warn(`[AUTOBOT] Intento de iniciar bot ya en estado: ${autobotLogic.botState.state}`);
            return res.status(400).json({ success: false, message: `Bot is already ${autobotLogic.botState.state}.`, botState: { ...autobotLogic.botState } });
        }
        try {
            const result = await autobotLogic.startBotStrategy(params);
            if (result.success) {
                return res.status(200).json(result);
            } else {
                return res.status(500).json(result);
            }
        } catch (error) {
            console.error('[SERVER] Error al iniciar el bot:', error);
            return res.status(500).json({ success: false, message: `Failed to start bot: ${error.message}` });
        }
    } else if (action === 'stop') {
        // console.log('[SERVER] Solicitud de detención recibida.');
        if (autobotLogic.botState.state === 'STOPPED') {
            console.warn('[AUTOBOT] Intento de detener bot ya detenido.');
            return res.status(400).json({ success: false, message: 'Bot is already stopped.', botState: { ...autobotLogic.botState } });
        }
        try {
            const result = await autobotLogic.stopBotStrategy();
            if (result.success) {
                return res.status(200).json(result);
            } else {
                return res.status(500).json(result);
            }
        } catch (error) {
            console.error('[SERVER] Error al detener el bot:', error);
            return res.status(500).json({ success: false, message: `Failed to stop bot: ${error.message}` });
        }
    } else {
        return res.status(400).json({ success: false, message: 'Invalid action provided.' });
    }
});

// Ruta para obtener el estado actual del bot (útil para que el frontend lo cargue al inicio)
app.get('/api/bot-state', (req, res) => {
    // console.log('[SERVER] Solicitud para obtener estado del bot.');
    res.status(200).json({ success: true, botState: { ...autobotLogic.botState } });
});

// Ruta de ejemplo para verificar que el servidor está vivo
app.get('/', (req, res) => {
    res.send('Autobot Backend Running!');
});

const PORT = process.env.PORT || 5000; // O el puerto que estés usando
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});