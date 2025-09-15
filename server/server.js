// BSB/server/server.js

const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const bitmartService = require('./services/bitmartService');
const spotService = require('./services/bitmartSpot');
const Order = require('./models/Order');
const Autobot = require('./models/Autobot');
const http = require('http');
const { Server } = require("socket.io");
const autobotLogic = require('./autobotLogic.js');
const { runLongStrategy, setDependencies: setLongDependencies } = require('./src/longStrategy');
const { runShortStrategy, setDependencies: setShortDependencies } = require('./src/shortStrategy');
const jwt = require('jsonwebtoken');
const { calculateInitialState } = require('./autobotCalculations');

const WebSocket = require('ws');
const bitmartWsUrl = 'wss://ws-manager-compress.bitmart.com/api?protocol=1.1&compression=true';

// Importa los archivos de rutas
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const ordersRoutes = require('./routes/ordersRoutes');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

const checkTimeSync = require('./services/check_time');

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    path: '/socket.io'
});

// Pasa la instancia de 'io' a la lógica del bot
autobotLogic.setIo(io);

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/users', userRoutes);

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

io.on('connection', (socket) => {
    console.log(`User connected with ID: ${socket.id}`);
    socket.on('disconnect', () => {
        console.log(`User disconnected with ID: ${socket.id}`);
    });
});

const BITMART_API_KEY = process.env.BITMART_API_KEY;
const BITMART_SECRET_KEY = process.env.BITMART_SECRET_KEY;
const BITMART_API_MEMO = process.env.BITMART_API_MEMO || "GainBot";

const bitmartCredentials = {
    apiKey: BITMART_API_KEY,
    secretKey: BITMART_SECRET_KEY,
    memo: BITMART_API_MEMO
};

function setupWebSocket(io) {
    const ws = new WebSocket(bitmartWsUrl);

    ws.onopen = function() {
        console.log("Conectado a la API de WebSocket de BitMart.");
        const subscribeMessage = {
            "op": "subscribe",
            "args": ["spot/ticker:BTC_USDT"]
        };
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

// Este es el BUCLE PRINCIPAL para emitir el estado del bot cada 3 segundos
setInterval(async () => {
    try {
        const botState = await Autobot.findOne({});
        if (botState) {
            // Lee los valores directamente de la base de datos
            const lbalance = botState.lStateData.lbalance || 0;
            const sbalance = botState.sStateData.sbalance || 0;

            io.sockets.emit('bot-state-update', {
                lstate: botState.lstate,
                sstate: botState.sstate,
                profit: botState.profit || 0, // Suponiendo que 'profit' también se guarda
                lbalance: lbalance,
                sbalance: sbalance,
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
}, 3000); // 3 segundos

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

// AÑADE ESTA SECCIÓN PARA USAR LOS ARCHIVOS DE RUTAS
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/orders', ordersRoutes);

// RUTAS EXISTENTES
app.get('/api/ticker/:symbol', (req, res) => {
    if (currentMarketPrice !== 'N/A') {
        res.status(200).json({ last: currentMarketPrice });
    } else {
        res.status(404).json({ message: 'Ticker not found or invalid data', success: false });
    }
});

app.get('/api/bitmart-data', async (req, res) => {
    try {
        const isValid = await bitmartService.validateApiKeys();
        console.log('[LOG] Validación de API Keys de BitMart:', isValid);
        if (!isValid) {
            return res.status(401).json({ message: 'BitMart API keys are not valid.', connected: false });
        }
        
        const balance = await bitmartService.getBalance();
        console.log('[LOG] Balance obtenido.');

        const openOrders = await bitmartService.getOpenOrders('BTC_USDT');
        console.log('[LOG] Se encontraron ' + (openOrders?.orders?.length || 0) + ' órdenes abiertas.');

        const historyOrdersResponse = await bitmartService.getHistoryOrders({ symbol: 'BTC_USDT' });
        const historyOrders = historyOrdersResponse && historyOrdersResponse.orders ? historyOrdersResponse.orders : [];
        console.log('[LOG] Se encontraron ' + historyOrders.length + ' órdenes en el historial.');
        
        const ticker = { data: { last: currentMarketPrice } };
        console.log('[LOG] Precio de mercado actual:', currentMarketPrice);

        res.status(200).json({
            message: 'BitMart data retrieved successfully.',
            connected: true,
            balance: balance,
            openOrders: openOrders?.orders || [],
            historyOrders: historyOrdersResponse?.orders || [],
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

app.post('/api/autobot/start', async (req, res) => {
    try {
        const { long, short, options } = req.body;
        let botState = await Autobot.findOne({});

        if (!botState) {
            botState = new Autobot({
                lstate: 'STOPPED',
                sstate: 'STOPPED',
                lStateData: {},
                sStateData: {},
                config: {
                    long: { enabled: false },
                    short: { enabled: false },
                    stopAtCycle: false
                }
            });
        }
        
        const initialLBalance = parseFloat(long.purchaseUsdt);
        
        botState.config.long = { ...botState.config.long, ...long, enabled: true };
        botState.config.short = { ...botState.config.short, ...short, enabled: true };
        botState.lstate = 'RUNNING';
        botState.sstate = 'RUNNING';
        botState.config.stopAtCycle = options.stopAtCycleEnd;
        botState.lStateData.lbalance = initialLBalance;

        await botState.save();

        io.sockets.emit('bot-state-update', {
            lstate: botState.lstate,
            sstate: botState.sstate,
            profit: botState.profit || 0,
            lbalance: initialLBalance,
            sbalance: botState.sStateData.sbalance || 0,
            ltprice: botState.lStateData.ltprice || 0,
            stprice: botState.sStateData.stprice || 0,
            lcycle: botState.lStateData.lcycle || 0,
            scycle: botState.sStateData.scycle || 0,
            lcoverage: botState.lStateData.lcoverage || 0,
            scoverage: botState.sStateData.scoverage || 0,
            lnorder: botState.lStateData.lnorder || 0,
            snorder: botState.sStateData.snorder || 0
        });

        autobotLogic.log('Ambas estrategias de Autobot (Long y Short) activadas.', 'success');
        res.json({ success: true, message: 'Autobot strategies started.' });

    } catch (error) {
        console.error('Failed to start Autobot strategies:', error);
        res.status(500).json({ success: false, message: 'Failed to start Autobot strategies.' });
    }
});

app.post('/api/autobot/stop', async (req, res) => {
    try {
        const botState = await Autobot.findOne({});
        if (botState) {
            botState.lstate = 'STOPPED';
            botState.sstate = 'STOPPED';
            botState.config.long.enabled = false;
            botState.config.short.enabled = false;
            await botState.save();

            console.log(`[BACKEND LOG]: Bot detenido y estado guardado en la DB: lstate: ${botState.lstate}, sstate: ${botState.sstate}`); 

            io.sockets.emit('bot-state-update', {
                lstate: botState.lstate,
                sstate: botState.sstate,
                profit: botState.profit || 0,
                lbalance: botState.lStateData.lbalance || 0,
                sbalance: botState.sStateData.sbalance || 0,
                ltprice: botState.lStateData.ltprice || 0,
                stprice: botState.sStateData.stprice || 0,
                lcycle: botState.lStateData.lcycle || 0,
                scycle: botState.sStateData.scycle || 0,
                lcoverage: botState.lStateData.lcoverage || 0,
                scoverage: botState.sStateData.scoverage || 0,
                lnorder: botState.lStateData.lnorder || 0,
                snorder: botState.sStateData.snorder || 0
            });

            autobotLogic.log('Autobot strategy stopped by user.', 'info');
            res.json({ success: true, message: 'Autobot strategy stopped.' });
        } else {
            res.status(404).json({ success: false, message: 'Bot state not found.' });
        }
    } catch (error) {
        console.error('Failed to stop Autobot strategy:', error);
        res.status(500).json({ success: false, message: 'Failed to stop Autobot strategy.' });
    }
});

app.post('/api/autobot/update-config', async (req, res) => {
    try {
        const { config } = req.body;
        console.log('[BACKEND LOG]: Valor de purchaseUsdt recibido en update-config:', config.long.purchaseUsdt);
        let botState = await Autobot.findOne({});
        
        if (!botState) {
            botState = new Autobot({
                lstate: 'STOPPED',
                sstate: 'STOPPED',
                lStateData: {},
                sStateData: {},
                config: config
            });
        } else {
            botState.config = config;
        }

        const newParams = calculateInitialState(config);
        botState.lStateData = { lbalance: newParams.lbalance };
        botState.sStateData = { sbalance: newParams.sbalance };

        await botState.save();

        // CORRECTO: Leemos el estado completo después de guardar y lo emitimos
        const updatedBotState = await Autobot.findOne({});

        io.sockets.emit('bot-state-update', {
            lstate: updatedBotState.lstate,
            sstate: updatedBotState.sstate,
            profit: updatedBotState.profit || 0,
            lbalance: updatedBotState.lStateData.lbalance || 0,
            sbalance: updatedBotState.sStateData.sbalance || 0,
            ltprice: updatedBotState.lStateData.ltprice || 0,
            stprice: updatedBotState.sStateData.stprice || 0,
            lcycle: updatedBotState.lStateData.lcycle || 0,
            scycle: updatedBotState.sStateData.scycle || 0,
            lcoverage: updatedBotState.lStateData.lcoverage || 0,
            scoverage: updatedBotState.sStateData.scoverage || 0,
            lnorder: updatedBotState.lStateData.lnorder || 0,
            snorder: updatedBotState.sStateData.snorder || 0
        });

        res.status(200).json({ success: true, message: 'Bot configuration updated successfully.' });
    } catch (error) {
        console.error('Failed to update bot configuration:', error);
        res.status(500).json({ success: false, message: 'Failed to update bot configuration.' });
    }
});

app.get('/', (req, res) => {
    res.send('Backend is running!');
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    checkTimeSync();
});