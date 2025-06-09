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
// const bitmartService = require('./services/bitmartService'); // No es necesario importar aquí si solo se usa en userRoutes
const BotState = require('./models/BotState');

// Importar la lógica del bot
const autobotLogic = require('./autobotLogic');
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
        // Opcional: Reanudar el bot si su último estado guardado era 'RUNNING' al reiniciar el servidor
        // Esto depende de tu lógica de negocio, si quieres que el bot se reanude automáticamente
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


// --- Endpoints Específicos del Bot/BitMart (¡Recomendación: Mover estos a userRoutes para usar autenticación!) ---
// Las rutas /api/balance, /api/open-orders, etc. que no están prefijadas con /api/user
// no usarán el middleware de autenticación de userRoutes.
// Si quieres que estas rutas usen las credenciales del usuario logueado, DEBES moverlas
// dentro de userRoutes o crear un middleware de autenticación para ellas.

app.get('/api/balance', (req, res) => {
    console.warn('⚠️ La ruta /api/balance no tiene autenticación de usuario y podría no funcionar sin credenciales BitMart explícitas. Considera usar /api/user/bitmart/balance con autenticación.');
    res.status(501).json({ message: 'Endpoint /api/balance no implementado con credenciales dinámicas. Usa /api/user/bitmart/balance con autenticación.' });
});

app.get('/test-balance', (req, res) => {
    console.warn('⚠️ La ruta /test-balance no tiene credenciales de BitMart hardcodeadas ni autenticación de usuario. Necesitará credenciales para funcionar o mover a userRoutes.');
    res.status(501).json({ message: 'Endpoint /test-balance necesita credenciales BitMart para funcionar o ser movido a userRoutes.' });
});

app.get('/api/open-orders', (req, res) => {
    console.warn('⚠️ La ruta /api/open-orders no tiene autenticación de usuario y podría no funcionar sin credenciales BitMart explícitas. Considera usar /api/user/bitmart/open-orders con autenticación.');
    res.status(501).json({ message: 'Endpoint /api/open-orders no implementado con credenciales dinámicas. Usa /api/user/bitmart/open-orders con autenticación.' });
});

app.get('/test-open-orders', (req, res) => {
    console.warn('⚠️ La ruta /test-open-orders no tiene credenciales de BitMart hardcodeadas ni autenticación de usuario. Necesitará credenciales para funcionar o mover a userRoutes.');
    res.status(501).json({ message: 'Endpoint /test-open-orders necesita credenciales BitMart para funcionar o ser movido a userRoutes.' });
});

app.get('/api/history-orders', (req, res) => {
    console.warn(`[SERVER] La funcionalidad para obtener historial de órdenes de BitMart aún no está implementada completamente en el backend.`);
    // Esta ruta debería usar autobotLogic.getHistoryOrders si es relevante,
    // o ser movida a userRoutes para obtener historial de un usuario autenticado.
    res.json([]); // Devuelve un array vacío por ahora
});


// Endpoint para obtener el estado del bot (para que el frontend lo muestre)
app.get('/api/bot-state', (req, res) => {
    // Asegúrate de que el botState sea un objeto plano para enviar al frontend
    res.json({ ...autobotLogic.botState });
});

// Endpoint para INICIAR/DETENER el bot
app.post('/api/toggle-bot', async (req, res) => {
    const { action, params } = req.body;

    console.log(`[SERVER] Recibida solicitud para /api/toggle-bot. Action: ${action}, Params:`, params);

    try {
        if (action === 'start') {
            if (autobotLogic.botState.status !== 'STOPPED') {
                console.warn(`[AUTOBOT] Intento de iniciar bot ya en estado: ${autobotLogic.botState.status}`);
                return res.status(400).json({ success: false, message: `Bot is already ${autobotLogic.botState.status}.`, botState: { ...autobotLogic.botState } });
            }

            console.log(`[SERVER] Parámetros recibidos del frontend para iniciar:`, params);

            // Actualizar solo los parámetros si se proporcionan
            if (params) {
                autobotLogic.botState.purchaseAmount = parseFloat(params.purchase) || autobotLogic.botState.purchaseAmount;
                autobotLogic.botState.incrementPercentage = parseFloat(params.increment) || autobotLogic.botState.incrementPercentage;
                autobotLogic.botState.decrementPercentage = parseFloat(params.decrement) || autobotLogic.botState.decrementPercentage;
                autobotLogic.botState.triggerPercentage = parseFloat(params.trigger) || autobotLogic.botState.triggerPercentage;
                // Considera si `stopAtCycleEnd` debe ser parte de `botState` y persistir
                autobotLogic.botState.stopAtCycleEnd = typeof params.stopAtCycleEnd === 'boolean' ? params.stopAtCycleEnd : autobotLogic.botState.stopAtCycleEnd;

                console.log(`[SERVER] botState parámetros actualizados.`);
            } else {
                console.warn('[SERVER] No se recibieron parámetros del frontend para iniciar. Usando valores predeterminados de botState.');
            }

            // Reiniciar o establecer los estados iniciales del ciclo si se inicia el bot
            Object.assign(autobotLogic.botState, {
                status: 'RUNNING',
                // Solo reiniciar ciclo y ganancias si no es una reanudación avanzada.
                // Si 'stopAtCycleEnd' lo detuvo, podrías querer mantener 'profit'.
                // Por ahora, reiniciamos para un "nuevo inicio".
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
                trigger: autobotLogic.botState.triggerPercentage,
                stopAtCycleEnd: autobotLogic.botState.stopAtCycleEnd
            });

            autobotLogic.startBotStrategy();

            // Enviar una COPIA del botState para evitar modificar el original fuera de la lógica del bot
            const botStateForFrontend = { ...autobotLogic.botState };
            console.log('[SERVER] Enviando botState al frontend:', botStateForFrontend);
            res.json({ success: true, message: 'Bot started', botState: botStateForFrontend });

        } else if (action === 'stop') {
            if (autobotLogic.botState.status === 'STOPPED') {
                console.warn('[AUTOBOT] Intento de detener bot ya detenido.');
                return res.status(400).json({ success: false, message: 'Bot is already stopped.', botState: { ...autobotLogic.botState } });
            }

            console.log('[AUTOBOT] Solicitud de DETENCIÓN del bot.');
            autobotLogic.stopBotStrategy();

            console.log('[AUTOBOT] Bot DETENIDO.');
            // Enviar una COPIA del botState para evitar modificar el original fuera de la lógica del bot
            const botStateForFrontend = { ...autobotLogic.botState };
            res.json({ success: true, message: 'Bot stopped', botState: botStateForFrontend });
        } else {
            console.error('[SERVER] Acción inválida recibida:', action);
            res.status(400).json({ success: false, message: 'Invalid action. Use "start" or "stop".', botState: { ...autobotLogic.botState } });
        }
    } catch (error) {
        console.error('[SERVER] Error al manejar la solicitud de toggle-bot:', error);
        res.status(500).json({ success: false, message: `Server error: ${error.message || 'Unknown error'}`, botState: { ...autobotLogic.botState } });
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
    autobotLogic.botState.status = 'STOPPED'; // Asegura que el estado final sea STOPPED antes de guardar
    await autobotLogic.saveBotStateToDB();
    console.log('[AUTOBOT] Bot detenido y estado guardado. Apagando servidor.');
    process.exit(0);
});