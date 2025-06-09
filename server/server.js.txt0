// backend/server.js
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http'); // Import http for Socket.IO
const socketIo = require('socket.io'); // Import socket.io

require('dotenv').config(); // Load environment variables from .env

const app = express();
const server = http.createServer(app); // Create HTTP server for Socket.IO

// --- Configuración de CORS para Socket.IO y Express ---
// CENTRALIZAMOS LA CONFIGURACIÓN DE CORS AQUÍ para evitar conflictos.
// La URL de tu frontend en Vercel es CRÍTICA aquí.
const FRONTEND_URL = process.env.FRONTEND_URL || "https://bsb-lime.vercel.app"; // Usar variable de entorno si existe, sino la de Vercel directamente.
                                                                                // Asegúrate de que process.env.FRONTEND_URL en Render sea 'https://bsb-lime.vercel.app'
                                                                                // O simplemente pon 'https://bsb-lime.vercel.app' si no quieres depender de env var por ahora.

const io = new socketIo.Server(server, { // Initialize Socket.IO server
    cors: {
        origin: FRONTEND_URL, // <--- Aquí va la URL exacta de tu frontend en Vercel
        methods: ["GET", "POST"]
    }
});

// Middleware CORS para Express (¡esto es lo que faltaba en tu anterior versión para el fetch normal!)
// Aplica a todas las rutas de Express (GET, POST, etc.)
app.use(cors({
    origin: FRONTEND_URL, // <--- Aquí también va la URL exacta de tu frontend en Vercel
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    optionsSuccessStatus: 204
}));

app.use(express.json()); // Middleware para parsear el cuerpo de las solicitudes JSON


// --- Importaciones de Módulos y Servicios ---
const authRoutes = require('./routes/authRoutes'); // Assuming authRoutes.js exists
const userRoutes = require('./routes/userRoutes'); // Assuming userRoutes.js exists
const bitmartService = require('./services/bitmartService'); // Asegúrate de que esta ruta sea correcta
const BotState = require('./models/BotState'); // Import the BotState model

// Importar la lógica del bot
const autobotLogic = require('./autobotLogic');
// Inyectar la instancia de io en la lógica del bot
autobotLogic.setIoInstance(io);

// Define el puerto del servidor. Usa process.env.PORT para producción en Render.
const port = process.env.PORT || 3001; // Usar el puerto de Render si está disponible, sino 3001

// --- Conectar a MongoDB ---
mongoose
    .connect(process.env.MONGO_URI, { // Usar process.env.MONGO_URI
        dbName: 'bsb', // Asegúrate de que 'bsb' es el nombre de tu base de datos
    })
    .then(async () => {
        console.log('✅ Conectado a MongoDB correctamente');
        // Cargar el estado del bot desde la base de datos al iniciar el servidor
        await autobotLogic.loadBotStateFromDB();
        // Opcional: Iniciar el bot si su último estado guardado era 'RUNNING'
        // if (autobotLogic.botState.status === 'RUNNING') {
        //     console.log('[AUTOBOT] Reanudando bot desde el último estado guardado...');
        //     autobotLogic.startBotStrategy();
        // }
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


// --- Endpoints Específicos del Bot/BitMart (Considera mover algunos a userRoutes si son específicos de usuario) ---

// Endpoint para obtener el balance del usuario
// NOTA: Estas rutas aquí abajo (api/balance, test-balance, etc.) están duplicadas o mal ubicadas
// si ya las tienes en userRoutes.js y quieres que usen autenticación.
// Las he dejado con el mensaje de "501 Not Implemented" para que tu las muevas o uses las de userRoutes.
app.get('/api/balance', async (req, res) => {
    console.warn('⚠️ La ruta /api/balance no tiene autenticación de usuario y podría no funcionar sin credenciales BitMart explícitas. Usa /api/user/bitmart/balance con autenticación.');
    res.status(501).json({ message: 'Endpoint /api/balance no implementado con credenciales dinámicas. Usa /api/user/bitmart/balance con autenticación.' });
});

// Ruta de PRUEBA: Obtener Balance (Mantenerla para pruebas directas)
app.get('/test-balance', async (req, res) => {
    console.log('\n--- Probando el endpoint /test-balance ---');
    console.warn('⚠️ La ruta /test-balance no tiene credenciales de BitMart hardcodeadas. Necesitará credenciales para funcionar.');
    res.status(501).json({ message: 'Endpoint /test-balance necesita credenciales BitMart para funcionar.' });
});

// Endpoint para obtener órdenes abiertas
app.get('/api/open-orders', async (req, res) => {
    console.warn('⚠️ La ruta /api/open-orders no tiene autenticación de usuario y podría no funcionar sin credenciales BitMart explícitas. Usa /api/user/bitmart/open-orders con autenticación.');
    res.status(501).json({ message: 'Endpoint /api/open-orders no implementado con credenciales dinámicas. Usa /api/user/bitmart/open-orders con autenticación.' });
});

// NUEVA RUTA DE PRUEBA: Obtener Órdenes Abiertas
app.get('/test-open-orders', async (req, res) => {
    console.warn('⚠️ La ruta /test-open-orders no tiene credenciales de BitMart hardcodeadas. Necesitará credenciales para funcionar.');
    res.status(501).json({ message: 'Endpoint /test-open-orders necesita credenciales BitMart para funcionar.' });
});

// Endpoint para obtener el historial de órdenes (AÚN NO IMPLEMENTADO COMPLETAMENTE)
app.get('/api/history-orders', async (req, res) => {
    console.warn(`[SERVER] La funcionalidad para obtener historial de órdenes de BitMart aún no está implementada en bitmartService.js para la pestaña '${req.query.status}'.`);
    res.json([]); // Devuelve un array vacío por ahora
});

// Endpoint para obtener el estado del bot (para que el frontend lo muestre)
app.get('/api/bot-state', (req, res) => {
    res.json(autobotLogic.botState);
});

// Endpoint para INICIAR/DETENER el bot
app.post('/api/toggle-bot', async (req, res) => {
    const { action, params } = req.body;

    console.log(`[DEBUG_SERVER] Recibida solicitud para /api/toggle-bot. Action: ${action}, Params:`, params);

    if (action === 'start') {
        if (autobotLogic.botState.status !== 'STOPPED') {
            console.warn(`[AUTOBOT] Intento de iniciar bot ya en estado: ${autobotLogic.botState.status}`);
            return res.status(400).json({ success: false, message: `Bot is already ${autobotLogic.botState.status}.` });
        }

        console.log(`[DEBUG_SERVER] Parámetros recibidos del frontend para iniciar:`, params);

        if (params) {
            autobotLogic.botState.purchaseAmount = parseFloat(params.purchase) || autobotLogic.botState.purchaseAmount;
            autobotLogic.botState.incrementPercentage = parseFloat(params.increment) || autobotLogic.botState.incrementPercentage;
            autobotLogic.botState.decrementPercentage = parseFloat(params.decrement) || autobotLogic.botState.decrementPercentage;
            autobotLogic.botState.triggerPercentage = parseFloat(params.trigger) || autobotLogic.botState.triggerPercentage;

            console.log(`[DEBUG_SERVER] botState.purchaseAmount actualizado a: ${autobotLogic.botState.purchaseAmount}`);
            console.log(`[DEBUG_SERVER] botState.incrementPercentage actualizado a: ${autobotLogic.botState.incrementPercentage}`);
            console.log(`[DEBUG_SERVER] botState.decrementPercentage actualizado a: ${autobotLogic.botState.decrementPercentage}`);
            console.log(`[DEBUG_SERVER] botState.triggerPercentage actualizado a: ${autobotLogic.botState.triggerPercentage}`);
        } else {
            console.warn('[DEBUG_SERVER] No se recibieron parámetros del frontend. Usando valores predeterminados de botState.');
        }

        Object.assign(autobotLogic.botState, {
            status: 'RUNNING',
            cycle: 1,
            profit: 0,
            cycleProfit: 0,
            ppc: 0,
            cp: 0,
            ac: 0,
            pm: 0,
            pv: 0,
            pc: 0,
            lastOrder: null,
            openOrders: [],
        });

        console.log(`[AUTOBOT] Bot INICIADO. Estado: ${autobotLogic.botState.status}, Parámetros FINALES:`, {
            purchase: autobotLogic.botState.purchaseAmount,
            increment: autobotLogic.botState.incrementPercentage,
            decrement: autobotLogic.botState.decrementPercentage,
            trigger: autobotLogic.botState.triggerPercentage
        });

        autobotLogic.startBotStrategy();

        const botStateForFrontend = { ...autobotLogic.botState };
        console.log('[DEBUG_SERVER] Enviando botState al frontend:', botStateForFrontend);
        res.json({ success: true, message: 'Bot started', botState: botStateForFrontend });

    } else if (action === 'stop') {
        if (autobotLogic.botState.status === 'STOPPED') {
            console.warn('[AUTOBOT] Intento de detener bot ya detenido.');
            return res.status(400).json({ success: false, message: 'Bot is already stopped.' });
        }

        console.log('[AUTOBOT] Solicitud de DETENCIÓN del bot.');
        autobotLogic.stopBotStrategy();

        console.log('[AUTOBOT] Bot DETENIDO.');
        const botStateForFrontend = { ...autobotLogic.botState };
        res.json({ success: true, message: 'Bot stopped', botState: botStateForFrontend });
    } else {
        console.error('[DEBUG_SERVER] Acción inválida recibida:', action);
        res.status(400).json({ success: false, message: 'Invalid action. Use "start" or "stop".' });
    }
});

// --- Iniciar el servidor HTTP y Socket.IO ---
server.listen(port, () => {
    console.log(`🚀 Backend server running on http://localhost:${port}`);
});

// --- Manejo de apagado para limpiar el intervalo ---
process.on('SIGINT', async () => {
    console.log('\n[AUTOBOT] Señal de apagado recibida. Deteniendo bot y guardando estado...');
    autobotLogic.stopBotStrategy();
    autobotLogic.botState.status = 'STOPPED';
    await autobotLogic.saveBotStateToDB();
    console.log('[AUTOBOT] Bot detenido y estado guardado. Apagando servidor.');
    process.exit(0);
});