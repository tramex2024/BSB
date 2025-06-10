// server/server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const autobotLogic = require('./autobotLogic');
const bitmartService = require('./services/bitmartService'); // <--- AÑADE ESTA LÍNEA
const http = require('http');
const { Server } = require("socket.io");

// --- Credenciales de BitMart (Añadir o asegurar que estén aquí) ---
const BITMART_API_KEY = process.env.BITMART_API_KEY;
const BITMART_SECRET_KEY = process.env.BITMART_SECRET_KEY;
const BITMART_MEMO = process.env.BITMART_MEMO; // O BITMART_PASSWORD, asegúrate del nombre exacto

// Objeto de credenciales a pasar a bitmartService
const authCredentials = {
    apiKey: BITMART_API_KEY,
    secretKey: BITMART_SECRET_KEY,
    apiMemo: BITMART_MEMO
};

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: ["https://bsb-lime.vercel.app", "http://localhost:3000"],
        methods: ["GET", "POST"]
    }
});

const corsOptions = {
    origin: ['https://bsb-lime.vercel.app', 'http://localhost:3000'],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    optionsSuccessStatus: 204
};
app.use(cors(corsOptions));

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

autobotLogic.setIoInstance(io);
autobotLogic.loadBotStateFromDB();
autobotLogic.setAuthCredentials(authCredentials);
app.use(express.json());

// --- Tus rutas de la API ---

// Ruta para verificar la conexión (GET /ping)
app.get('/ping', (req, res) => {
    // CAMBIO AQUÍ: Envía JSON en lugar de texto plano
    res.status(200).json({ message: 'pong' }); 
});

// Ruta para obtener balances de BitMart (GET /api/user/bitmart/balance)
app.get('/api/user/bitmart/balance', async (req, res) => {
    try {
        const balances = await bitmartService.getBalance();
        res.json(balances);
    } catch (error) {
        console.error('Error fetching BitMart balances:', error.message);
        // Es crucial que el mensaje de error del backend sea JSON y dé más detalles.
        res.status(500).json({ error: 'Failed to fetch BitMart balances', details: error.message, stack: error.stack });
    }
});

// Ruta para obtener órdenes abiertas de BitMart (GET /api/user/bitmart/open-orders)
app.get('/api/user/bitmart/open-orders', async (req, res) => {
    const { symbol } = req.query;
    if (!symbol) {
        return res.status(400).json({ error: 'Symbol parameter is required.' });
    }
    try {
        const openOrders = await bitmartService.getOpenOrders(symbol);
        res.json(openOrders);
    } catch (error) {
        console.error(`Error fetching BitMart open orders for ${symbol}:`, error.message);
        // También aquí, asegúrate de que el error sea JSON y detallado.
        res.status(500).json({ error: `Failed to fetch BitMart open orders for ${symbol}`, details: error.message, stack: error.stack });
    }
});


// Ruta para alternar el estado del bot (POST /api/toggle-bot)
app.post('/api/toggle-bot', async (req, res) => {
    const { action, params } = req.body;

    if (action === 'start') {
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

// Ruta para obtener balances de BitMart (GET /api/user/bitmart/balance)
app.get('/api/user/bitmart/balance', async (req, res) => {
    try {
        // PASAR authCredentials aquí
        const balances = await bitmartService.getBalance(authCredentials); 
        res.json(balances);
    } catch (error) {
        console.error('Error fetching BitMart balances:', error.message);
        res.status(500).json({ error: 'Failed to fetch BitMart balances', details: error.message, stack: error.stack });
    }
});

// Ruta para obtener órdenes abiertas de BitMart (GET /api/user/bitmart/open-orders)
app.get('/api/user/bitmart/open-orders', async (req, res) => {
    const { symbol } = req.query;
    if (!symbol) {
        return res.status(400).json({ error: 'Symbol parameter is required.' });
    }
    try {
        // PASAR authCredentials aquí
        const openOrders = await bitmartService.getOpenOrders(authCredentials, symbol); 
        res.json(openOrders);
    } catch (error) {
        console.error(`Error fetching BitMart open orders for ${symbol}:`, error.message);
        res.status(500).json({ error: `Failed to fetch BitMart open orders for ${symbol}`, details: error.message, stack: error.stack });
    }
});

// Además, las llamadas en autobotLogic.js también deberán recibir authCredentials
// Tendrás que pasar `authCredentials` a las funciones de autobotLogic que a su vez llaman a bitmartService.
// Por ahora, nos enfocamos en las rutas directas de la API, pero esto es algo a tener en cuenta.
// La manera más limpia es que autobotLogic también reciba `authCredentials` en su inicialización
// o en sus funciones que interactúan con bitmartService.

// Por ejemplo, en autobotLogic.js:
// bitmartService.placeOrder(authCredentials, tradeSymbol, side, orderType, sizeUSDT.toString());

app.get('/api/bot-state', (req, res) => {
    res.status(200).json({ success: true, botState: { ...autobotLogic.botState } });
});

app.get('/', (req, res) => {
    res.send('Autobot Backend Running!');
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});