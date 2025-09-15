// BSB/server/server.js

const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

// Servicios y Lógica del Bot
const bitmartService = require('./services/bitmartService');
const autobotLogic = require('./autobotLogic.js');
const checkTimeSync = require('./services/check_time');

// Modelos
const Order = require('./models/Order');
const Autobot = require('./models/Autobot');

// Routers
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const ordersRoutes = require('./routes/ordersRoutes');
const autobotRoutes = require('./routes/autobotRoutes'); // Importa el nuevo router

// Middleware
const authMiddleware = require('./middleware/authMiddleware');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    path: '/socket.io'
});

autobotLogic.setIo(io);

// Configuración de Express y Middlewares
app.use(cors());
app.use(express.json());

// Definición de Rutas
app.use('/api/auth', authRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/users', userRoutes);
app.use('/api/autobot', autobotRoutes); // Usa el nuevo router, ya protegido

// Conexión a la Base de Datos
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected...');
    } catch (err) {
        console.error('MongoDB connection error:', err.message);
        process.exit(1);
    }
};

connectDB();

let currentMarketPrice = 'N/A';

// Configuración de WebSocket para datos de mercado
const bitmartWsUrl = 'wss://ws-manager-compress.bitmart.com/api?protocol=1.1&compression=true';
function setupWebSocket(io) {
    const ws = new WebSocket(bitmartWsUrl);
    ws.onopen = function() {
        console.log("Conectado a la API de WebSocket de BitMart.");
        const subscribeMessage = { "op": "subscribe", "args": ["spot/ticker:BTC_USDT"] };
        ws.send(JSON.stringify(subscribeMessage));
    };
    ws.onmessage = function(event) {
        try {
            const data = JSON.parse(event.data);
            if (data && data.data && data.data.length > 0 && data.data[0].symbol === 'BTC_USDT') {
                currentMarketPrice = data.data[0].last_price;
                io.emit('marketData', { price: currentMarketPrice });
            }
        } catch (error) {
            console.error("Error al procesar el mensaje de WebSocket:", error);
        }
    };
    ws.onclose = function() {
        console.log("Conexión de WebSocket a BitMart cerrada. Reconectando...");
        setTimeout(() => setupWebSocket(io), 5000);
    };
    ws.onerror = function(err) {
        console.error("Error en la conexión de WebSocket:", err);
        ws.close();
    };
}

setupWebSocket(io);

// Conexión de Socket.IO
io.on('connection', (socket) => {
    console.log(`User connected with ID: ${socket.id}`);
    socket.on('disconnect', () => {
        console.log(`User disconnected with ID: ${socket.id}`);
    });
});

// Bucle principal para emitir el estado del bot
setInterval(async () => {
    try {
        const botState = await Autobot.findOne({});
        if (botState) {
            io.sockets.emit('bot-state-update', {
                lstate: botState.lstate,
                sstate: botState.sstate,
                profit: botState.profit || 0,
                lbalance: botState.lbalance || 0,
                sbalance: botState.sbalance || 0,
                ltprice: botState.lStateData.ltprice || 0,
                stprice: botState.sStateData.stprice || 0,
                lcycle: botState.lStateData.lcycle || 0,
                scycle: botState.sStateData.scycle || 0,
                lcoverage: botState.lStateData.lcoverage || 0,
                scoverage: botState.sStateData.scoverage || 0,
                lnorder: botState.lStateData.lnorder || 0,
                snorder: botState.sStateData.snorder || 0
            });
        }
    } catch (error) {
        console.error('Error al emitir el estado del bot:', error);
    }
}, 3000);

// Bucle principal de la lógica del bot
(async function startBotCycle() {
    try {
        const botState = await Autobot.findOne({});
        if (botState && (botState.lstate === 'RUNNING' || botState.sstate === 'RUNNING') && currentMarketPrice !== 'N/A') {
            await autobotLogic.botCycle(currentMarketPrice);
        }
    } catch (error) {
        console.error('[BOT LOG]: Error en el ciclo principal del bot:', error.message);
    } finally {
        setTimeout(startBotCycle, 10000);
    }
})();

// Endpoint de la API
app.get('/api/ticker/:symbol', (req, res) => {
    if (currentMarketPrice !== 'N/A') {
        res.status(200).json({ last: currentMarketPrice });
    } else {
        res.status(404).json({ message: 'Ticker not found or invalid data', success: false });
    }
});

app.get('/api/bitmart-data', async (req, res) => {
    try {
        // La lógica de validación de claves debe estar en un middleware para proteger la ruta
        const isValid = await bitmartService.validateApiKeys();
        if (!isValid) {
            return res.status(401).json({ message: 'BitMart API keys are not valid.', connected: false });
        }
        
        const balance = await bitmartService.getBalance();
        const openOrders = await bitmartService.getOpenOrders('BTC_USDT');
        const historyOrdersResponse = await bitmartService.getHistoryOrders({ symbol: 'BTC_USDT' });
        const historyOrders = historyOrdersResponse?.orders || [];
        const ticker = { data: { last: currentMarketPrice } };

        res.status(200).json({
            message: 'BitMart data retrieved successfully.',
            connected: true,
            balance: balance,
            openOrders: openOrders?.orders || [],
            historyOrders: historyOrders,
            ticker: ticker && ticker.data ? ticker.data : null,
        });
    } catch (error) {
        console.error('Error en el endpoint /bitmart-data:', error);
        res.status(500).json({
            message: 'Failed to retrieve BitMart data. Check server logs and API keys.',
            connected: false,
            error: error.message
        });
    }
});

app.get('/api/user/bot-config-and-state', async (req, res) => {
    try {
        const autobotConfig = await Autobot.findOne({});
        if (autobotConfig) {
            res.status(200).json({
                lstate: autobotConfig.lstate,
                sstate: autobotConfig.sstate,
                purchase: autobotConfig.config.long.purchaseUsdt,
                price_var: autobotConfig.config.long.price_var,
                size_var: autobotConfig.config.long.size_var,
                trigger: autobotConfig.config.long.trigger,
                stopAtCycle: autobotConfig.config.stopAtCycle,
                short: {
                    sellBtc: autobotConfig.config.short.sellBtc,
                    price_var: autobotConfig.config.short.price_var,
                    size_var: autobotConfig.config.short.size_var,
                    trigger: autobotConfig.config.short.trigger,
                },
                long: {
                    purchaseUsdt: autobotConfig.config.long.purchaseUsdt,
                    price_var: autobotConfig.config.long.price_var,
                    size_var: autobotConfig.config.long.size_var,
                    trigger: autobotConfig.config.long.trigger,
                },
            });
        } else {
            res.status(200).json({ lstate: 'STOPPED', sstate: 'STOPPED' });
        }
    } catch (error) {
        console.error('Error fetching bot state from DB:', error);
        res.status(500).json({ message: 'Internal server error', success: false });
    }
});

app.get('/', (req, res) => {
    res.send('Backend is running!');
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    checkTimeSync();
});