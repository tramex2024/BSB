const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const bitmartService = require('./services/bitmartService');
const Order = require('./models/Order');
const Autobot = require('./models/Autobot');
const http = require('http');
const { Server } = require("socket.io");
const autobotStrategy = require('./autobotLogic.js');

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

const corsOptions = {
    origin: 'https://bsb-lime.vercel.app'
};
app.use(cors(corsOptions));
app.use(express.json());

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

io.on('connection', (socket) => {
    console.log(`User connected with ID: ${socket.id}`);
    socket.on('disconnect', () => {
        console.log(`User disconnected with ID: ${socket.id}`);
    });
});

const bitmartCredentials = {
    apiKey: process.env.BITMART_API_KEY,
    secretKey: process.env.BITMART_SECRET_KEY,
    apiMemo: process.env.BITMART_API_MEMO || ''
};

// --- Nuevos Endpoints para el Frontend ---

// 1. Obtener precio en vivo (ticker)
app.get('/ticker/:symbol', async (req, res) => {
    try {
        const symbol = req.params.symbol;
        const tickerData = await bitmartService.getTicker(symbol);
        if (tickerData && tickerData.last) {
            res.status(200).json({ last: tickerData.last });
        } else {
            res.status(404).json({ message: 'Ticker not found or invalid data', success: false });
        }
    } catch (error) {
        console.error('Error fetching ticker:', error.message);
        res.status(500).json({ message: 'Internal server error', success: false });
    }
});

// 2. Obtener órdenes abiertas
app.get('/orders/opened', async (req, res) => {
    try {
        const openOrders = await bitmartService.getOpenOrders(bitmartCredentials, 'BTC_USDT');
        res.status(200).json(openOrders);
    } catch (error) {
        console.error('Error fetching open orders:', error.message);
        res.status(500).json({ message: 'Internal server error', success: false });
    }
});

// 3. Endpoint principal de datos consolidados
app.get('/bitmart-data', async (req, res) => {
    try {
        const isValid = await bitmartService.validateApiKeys(
            bitmartCredentials.apiKey,
            bitmartCredentials.secretKey,
            bitmartCredentials.apiMemo
        );
        if (!isValid) {
            return res.status(401).json({ message: 'BitMart API keys are not valid.', connected: false });
        }
        const balance = await bitmartService.getBalance(bitmartCredentials);
        const openOrders = await bitmartService.getOpenOrders(bitmartCredentials, 'BTC_USDT');
        const ticker = await bitmartService.getTicker('BTC_USDT');
        res.status(200).json({
            message: 'BitMart data retrieved successfully.',
            connected: true,
            balance: balance,
            openOrders: openOrders.orders,
            ticker: ticker && ticker.data && ticker.data.tickers && ticker.data.tickers.length > 0 ? ticker.data.tickers[0] : null,
        });
    } catch (error) {
        console.error('Error in /bitmart-data endpoint:', error.message);
        res.status(500).json({
            message: 'Failed to retrieve BitMart data. Check server logs and API keys.',
            connected: false,
            error: error.message
        });
    }
});

// Nuevo Endpoint para el estado del bot
app.get('/api/user/bot-config-and-state', async (req, res) => {
    try {
        const autobotConfig = await Autobot.findOne({});
        if (autobotConfig) {
            res.status(200).json({
                lstate: autobotConfig.lstate,
                sstate: autobotConfig.sstate,
            });
        } else {
            res.status(200).json({ lstate: 'STOPPED', sstate: 'STOPPED' });
        }
    } catch (error) {
        console.error('Error fetching bot state from DB:', error);
        res.status(500).json({ message: 'Internal server error', success: false });
    }
});

// 4. Nuevo Endpoint para obtener balances de la cuenta
app.get('/api/user/balances', async (req, res) => {
    try {
        const balances = await bitmartService.getBalance(bitmartCredentials);
        if (balances) {
            res.status(200).json({ success: true, wallet: balances });
        } else {
            res.status(404).json({ message: 'Balances not found or invalid data.', success: false });
        }
    } catch (error) {
        console.error('Error fetching balances:', error.message);
        res.status(500).json({ message: 'Internal server error', success: false });
    }
});

// --- NUEVO ENDPOINT PARA INICIAR EL AUTOBOT CON LA CONFIGURACIÓN DEL FRONTEND ---
app.post('/api/autobot/start', async (req, res) => {
    try {
        const botConfig = req.body; // Captura la configuración enviada desde el frontend
        
        // Llama a la función 'start' con la configuración y las credenciales
        await autobotStrategy.start(botConfig, bitmartCredentials);

        res.json({ success: true, message: 'Autobot strategy started.' });
    } catch (error) {
        console.error('Failed to start Autobot strategy:', error);
        res.status(500).json({ success: false, message: 'Failed to start Autobot strategy.' });
    }
});

// Ruta para detener el Autobot (sin cambios)
app.post('/api/autobot/stop', async (req, res) => {
    try {
        await autobotStrategy.stop();
        res.json({ success: true, message: 'Autobot strategy stopped.' });
    } catch (error) {
        console.error('Failed to stop Autobot strategy:', error);
        res.status(500).json({ success: false, message: 'Failed to stop Autobot strategy.' });
    }
});

// Ruta de prueba principal para verificar que el servidor está funcionando
app.get('/', (req, res) => {
    res.send('Backend is running!');
});

autobotStrategy.setIo(io);

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});