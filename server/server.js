// backend/server.js
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http'); // Import http for Socket.IO
const socketIo = require('socket.io'); // Import socket.io

require('dotenv').config(); // Load environment variables from .env

const app = express();
const server = http.createServer(app); // Create HTTP server for Socket.IO
const io = new socketIo.Server(server, { // Initialize Socket.IO server
    cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000", // Allows access from your React frontend (use env var for deployment)
        methods: ["GET", "POST"]
    }
});

// --- Importaciones de Módulos y Servicios ---
// Nota: La conexión a la DB se moverá aquí arriba, pero el "connectDB" import ya no es necesario
// porque la conexión se manejará directamente con mongoose.connect en este archivo.

// Importar rutas de autenticación y usuario
const authRoutes = require('./routes/authRoutes'); // Assuming authRoutes.js exists
const userRoutes = require('./routes/userRoutes'); // Assuming userRoutes.js exists

// Servicios y modelos
const bitmartService = require('./services/bitmartService'); // Asegúrate de que esta ruta sea correcta
const BotState = require('./models/BotState'); // Import the BotState model
// const axios = require('axios'); // Comentado: axios ya se usa internamente en bitmartService.js.
                                  // Si lo necesitas aquí para otra cosa, descomenta.

// Importar la lógica del bot
const autobotLogic = require('./autobotLogic');
// Inyectar la instancia de io en la lógica del bot
autobotLogic.setIoInstance(io);

// Define el puerto del servidor. Usa process.env.PORT para producción en Render.
const port = process.env.PORT || 3001; // Usar el puerto de Render si está disponible, sino 3001

// --- Middlewares ---
app.use(cors()); // Asegúrate de que tu FRONTEND_URL en el .env de Render es el correcto para CORS
app.use(express.json()); // Middleware para parsear el cuerpo de las solicitudes JSON

// --- Conectar a MongoDB ---
// Ahora la conexión se hace directamente en server.js en lugar de un archivo db.js separado.
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
// CONSIDERACIÓN: Esta ruta debería ser parte de userRoutes y usar bitmartAuthMiddleware
// Ya tienes `/api/user/bitmart/balance` en userRoutes.js. Este endpoint podría eliminarse
// o actualizarse para usar el middleware de autenticación de usuario.
// POR AHORA, lo mantengo, pero sin autenticación de usuario, solo para propósitos de prueba directa.
app.get('/api/balance', async (req, res) => {
    // Si necesitas autenticación aquí, debes añadir authMiddleware y bitmartAuthMiddleware
    try {
        // Asumiendo que para esta ruta de 'test', las credenciales son hardcodeadas o se obtienen de una forma global de prueba.
        // Esto NO es seguro para una aplicación real.
        // Para usar bitmartService.getBalance(), necesitas las credenciales (apiKey, secretKey, apiMemo)
        // Por ejemplo, de un usuario logueado o de variables de entorno si es un bot de un solo usuario.
        // Si no tienes un usuario logueado, esta llamada fallará como está en bitmartService.js.
        // DEBES pasar `authCredentials` a `bitmartService.getBalance()`.
        // Para pruebas rápidas sin autenticación, podrías temporalmente usar credenciales de .env aquí,
        // pero en un entorno de producción, siempre usa las del usuario autenticado.

        // Ejemplo TEMPORAL (NO SEGURO PARA PROD SIN AUTENTICACIÓN):
        // const TEST_API_KEY = process.env.BITMART_API_KEY;
        // const TEST_SECRET_KEY = process.env.BITMART_API_SECRET;
        // const TEST_API_MEMO = process.env.BITMART_API_MEMO;
        // const balances = await bitmartService.getBalance({
        //     apiKey: TEST_API_KEY,
        //     secretKey: TEST_SECRET_KEY,
        //     apiMemo: TEST_API_MEMO
        // });

        // Ya que tienes userRoutes.js con /api/user/bitmart/balance,
        // este endpoint `/api/balance` es redundante o está incompleto sin credenciales.
        // Te recomiendo usar `/api/user/bitmart/balance` con el authMiddleware y bitmartAuthMiddleware.
        console.warn('⚠️ La ruta /api/balance no tiene autenticación de usuario y podría no funcionar sin credenciales BitMart explícitas.');
        res.status(501).json({ message: 'Endpoint /api/balance no implementado con credenciales dinámicas. Usa /api/user/bitmart/balance con autenticación.' });
    } catch (error) {
        console.error('Error fetching balance:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch balance' });
    }
});

// Ruta de PRUEBA: Obtener Balance (Mantenerla para pruebas directas)
// Similar al de arriba, esta ruta también necesita credenciales.
// Si es solo para pruebas de BitMart service sin la DB de usuario,
// necesitas pasar las credenciales directamente.
app.get('/test-balance', async (req, res) => {
    console.log('\n--- Probando el endpoint /test-balance ---');
    try {
        // Aquí también necesitarás credenciales de BitMart para `bitmartService.getBalance()`
        // Si es una prueba de desarrollo, podrías usar directamente las credenciales de un .env
        // para este endpoint específico, pero NO en producción para operaciones de usuario.
        // Ejemplo (para desarrollo, NO para producción de cara al usuario):
        // const TEST_API_KEY = process.env.BITMART_API_KEY;
        // const TEST_SECRET_KEY = process.env.BITMART_API_SECRET;
        // const TEST_API_MEMO = process.env.BITMART_API_MEMO;
        // const balance = await bitmartService.getBalance({
        //     apiKey: TEST_API_KEY,
        //     secretKey: TEST_SECRET_KEY,
        //     apiMemo: TEST_API_MEMO
        // });
        // console.log('Balance obtenido exitosamente desde la API BitMart.');
        // res.json({ message: 'Balance obtenido con éxito', data: balance });
        console.warn('⚠️ La ruta /test-balance no tiene credenciales de BitMart hardcodeadas. Necesitará credenciales para funcionar.');
        res.status(501).json({ message: 'Endpoint /test-balance necesita credenciales BitMart para funcionar.' });

    } catch (error) {
        console.error('❌ Error al obtener balance:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint para obtener órdenes abiertas
// CONSIDERACIÓN: Esta ruta también debería ser parte de userRoutes y usar bitmartAuthMiddleware.
// Ya tienes `/api/user/bitmart/open-orders` en userRoutes.js.
app.get('/api/open-orders', async (req, res) => {
    const { symbol } = req.query;
    try {
        // Similar a /api/balance, esta llamada necesita `authCredentials`.
        console.warn('⚠️ La ruta /api/open-orders no tiene autenticación de usuario y podría no funcionar sin credenciales BitMart explícitas.');
        res.status(501).json({ message: 'Endpoint /api/open-orders no implementado con credenciales dinámicas. Usa /api/user/bitmart/open-orders con autenticación.' });
        // const bitmartOpenOrders = await bitmartService.getOpenOrders(CREDENTIALS_HERE, symbol);
        // ... (resto de la lógica)
    } catch (error) {
        console.error('Error fetching open orders:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch open orders' });
    }
});

// NUEVA RUTA DE PRUEBA: Obtener Órdenes Abiertas
// Similar a las rutas de balance, necesitará credenciales.
app.get('/test-open-orders', async (req, res) => {
    const symbol = req.query.symbol || autobotLogic.TRADE_SYMBOL; // Usar el símbolo de la lógica del bot
    console.log(`\n--- Probando el endpoint /test-open-orders para ${symbol} ---`);
    try {
        // También necesitará credenciales de BitMart para `bitmartService.getOpenOrders()`
        console.warn('⚠️ La ruta /test-open-orders no tiene credenciales de BitMart hardcodeadas. Necesitará credenciales para funcionar.');
        res.status(501).json({ message: 'Endpoint /test-open-orders necesita credenciales BitMart para funcionar.' });
        // const openOrders = await bitmartService.getOpenOrders(CREDENTIALS_HERE, symbol);
        // ... (resto de la lógica)
    } catch (error) {
        console.error('❌ Error al obtener órdenes abiertas:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint para obtener el historial de órdenes (AÚN NO IMPLEMENTADO COMPLETAMENTE)
// Este también necesitará `authCredentials`.
app.get('/api/history-orders', async (req, res) => {
    const { symbol, status } = req.query; // 'filled', 'cancelled', 'all'
    try {
        console.warn(`[SERVER] La funcionalidad para obtener historial de órdenes de BitMart aún no está implementada en bitmartService.js para la pestaña '${status}'.`);
        // Si implementas getHistoryOrdersV4 en bitmartService, necesitarás:
        // const historyOrders = await bitmartService.getHistoryOrdersV4(CREDENTIALS_HERE, { symbol, status });
        // res.json(historyOrders);
        res.json([]); // Devuelve un array vacío por ahora
    } catch (error) {
        console.error('Error fetching history orders:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch history orders' });
    }
});

// Endpoint para obtener el estado del bot (para que el frontend lo muestre)
app.get('/api/bot-state', (req, res) => {
    res.json(autobotLogic.botState);
});

// Endpoint para INICIAR/DETENER el bot
app.post('/api/toggle-bot', async (req, res) => {
    const { action, params } = req.body; // 'start' o 'stop' y los parámetros del frontend

    console.log(`[DEBUG_SERVER] Recibida solicitud para /api/toggle-bot. Action: ${action}, Params:`, params);

    if (action === 'start') {
        if (autobotLogic.botState.status !== 'STOPPED') {
            console.warn(`[AUTOBOT] Intento de iniciar bot ya en estado: ${autobotLogic.botState.status}`);
            return res.status(400).json({ success: false, message: `Bot is already ${autobotLogic.botState.status}.` });
        }

        console.log(`[DEBUG_SERVER] Parámetros recibidos del frontend para iniciar:`, params);

        // Actualizar parámetros con los enviados desde el frontend directamente en el botState importado
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

        // Resetear el estado para un nuevo inicio directamente en el botState importado
        Object.assign(autobotLogic.botState, {
            status: 'RUNNING',
            cycle: 1, // Iniciar en ciclo 1
            profit: 0,
            cycleProfit: 0,
            ppc: 0,
            cp: 0,
            ac: 0,
            pm: 0,
            pv: 0,
            pc: 0,
            lastOrder: null,
            openOrders: [], // Asegurarse de que no hay órdenes abiertas del bot de sesiones anteriores
        });

        console.log(`[AUTOBOT] Bot INICIADO. Estado: ${autobotLogic.botState.status}, Parámetros FINALES:`, {
            purchase: autobotLogic.botState.purchaseAmount,
            increment: autobotLogic.botState.incrementPercentage,
            decrement: autobotLogic.botState.decrementPercentage,
            trigger: autobotLogic.botState.triggerPercentage
        });

        autobotLogic.startBotStrategy(); // Iniciar la estrategia del bot a través de la función exportada

        const botStateForFrontend = { ...autobotLogic.botState }; // Copiar el estado para enviar
        console.log('[DEBUG_SERVER] Enviando botState al frontend:', botStateForFrontend);
        res.json({ success: true, message: 'Bot started', botState: botStateForFrontend });

    } else if (action === 'stop') {
        if (autobotLogic.botState.status === 'STOPPED') {
            console.warn('[AUTOBOT] Intento de detener bot ya detenido.');
            return res.status(400).json({ success: false, message: 'Bot is already stopped.' });
        }

        console.log('[AUTOBOT] Solicitud de DETENCIÓN del bot.');
        autobotLogic.stopBotStrategy(); // Detener la estrategia del bot a través de la función exportada

        console.log('[AUTOBOT] Bot DETENIDO.');
        const botStateForFrontend = { ...autobotLogic.botState }; // Copiar el estado para enviar
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
    autobotLogic.stopBotStrategy(); // Detener el intervalo antes de guardar el estado
    autobotLogic.botState.status = 'STOPPED'; // Asegurarse de que el estado sea 'STOPPED'
    await autobotLogic.saveBotStateToDB(); // Guardar el estado final al apagar
    console.log('[AUTOBOT] Bot detenido y estado guardado. Apagando servidor.');
    process.exit(0);
});