// server/server.js

require('dotenv').config(); // Carga las variables de entorno desde .env
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');

// Importa la lógica del bot
const autobotLogic = require('./autobotLogic'); // Asegúrate de que esta ruta sea correcta

const app = express();
const server = http.createServer(app);

// Configuración de Socket.IO
const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL || '*', // Permite tu frontend
        methods: ["GET", "POST"]
    }
});

// Inyecta la instancia de Socket.IO en la lógica del bot
autobotLogic.setIoInstance(io);

// Conexión a MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('Conectado a MongoDB Atlas');
        // Cargar el estado del bot desde la DB una vez que la conexión sea exitosa
        autobotLogic.loadBotStateFromDB();
    })
    .catch(err => console.error('Error al conectar a MongoDB:', err));

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || '*', // Usa la URL de tu frontend desde .env
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json()); // Para parsear cuerpos de petición JSON

// --- Rutas de la API ---

// Ruta para obtener el estado actual del bot
app.get('/api/bot-state', (req, res) => {
    if (autobotLogic.botState) {
        return res.json(autobotLogic.botState);
    } else {
        return res.status(503).json({ error: 'Bot state not loaded yet.' });
    }
});

// Ruta para iniciar o detener el bot
app.post('/api/toggle-bot', async (req, res) => {
    const { action, purchaseAmount, incrementPercentage, decrementPercentage, triggerPercentage, stopOnCycleEnd } = req.body;
    console.log(`[SERVER] Solicitud para ${action} el bot con parámetros:`, req.body);

    if (!autobotLogic.botState) {
        return res.status(503).json({ error: 'Bot state not initialized yet. Please wait.' });
    }

    if (action === 'start') {
        // Validación de parámetros al iniciar el bot
        if (typeof purchaseAmount !== 'number' || purchaseAmount <= 0 ||
            typeof incrementPercentage !== 'number' || incrementPercentage < 0 ||
            typeof decrementPercentage !== 'number' || decrementPercentage < 0 ||
            typeof triggerPercentage !== 'number' || triggerPercentage < 0) {
            return res.status(400).json({ error: 'Parámetros de inicio inválidos. Asegura que purchaseAmount es > 0 y los porcentajes son números no negativos.' });
        }
        
        // Asigna los parámetros al estado del bot ANTES de llamar a startBotStrategy
        autobotLogic.botState.purchaseAmount = purchaseAmount;
        autobotLogic.botState.incrementPercentage = incrementPercentage;
        autobotLogic.botState.decrementPercentage = decrementPercentage;
        autobotLogic.botState.triggerPercentage = triggerPercentage;
        autobotLogic.botState.stopOnCycleEnd = typeof stopOnCycleEnd === 'boolean' ? stopOnCycleEnd : false; // Asegura que sea booleano

        const result = await autobotLogic.startBotStrategy();
        return res.json(result);
    } else if (action === 'stop') {
        const result = await autobotLogic.stopBotStrategy();
        return res.json(result);
    } else {
        return res.status(400).json({ error: 'Acción no válida. Usa "start" o "stop".' });
    }
});

// Ruta para obtener los balances actuales
app.get('/api/balances', async (req, res) => {
    try {
        const balances = await autobotLogic.bitmartService.getBalance();
        res.json(balances);
    } catch (error) {
        console.error('Error al obtener balances:', error);
        res.status(500).json({ error: 'Error al obtener balances.' });
    }
});

// Ruta de prueba para la raíz (opcional)
app.get('/', (req, res) => {
    res.send('API del Autobot en funcionamiento!');
});

// Puerto del servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});