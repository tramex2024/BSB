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

const WebSocket = require('ws');
const bitmartWsUrl = 'wss://ws-manager-compress.bitmart.com/api?protocol=1.1&compression=true';

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

app.get('/api/ticker/:symbol', (req, res) => {
    if (currentMarketPrice !== 'N/A') {
        res.status(200).json({ last: currentMarketPrice });
    } else {
        res.status(404).json({ message: 'Ticker not found or invalid data', success: false });
    }
});

app.get('/api/orders/:status', async (req, res) => {
    const { status } = req.params;
    
    if (!bitmartCredentials.apiKey || !bitmartCredentials.secretKey || !bitmartCredentials.memo) {
        return res.status(400).json({ success: false, message: 'API keys are not configured on the server.' });
    }

    try {
        let result;
        const symbol = 'BTC_USDT';

        switch (status) {
            case 'opened':
                result = await bitmartService.getOpenOrders(symbol);
                break;
            case 'filled':
            case 'cancelled':
            case 'all':
                // Prueba de Historial de Órdenes (Buscando en los últimos 90 días)
                const endTime = Date.now();
                const ninetyDaysAgo = new Date();
                ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
                const startTime = ninetyDaysAgo.getTime();
                
                const historyParams = {
                    symbol: 'BTC_USDT',
                    orderMode: 'spot',
                    startTime: startTime,
                    endTime: endTime,
                    limit: 100 // O el número que prefieras
                };
                if (status !== 'all') {
                    historyParams.status = status;
                }
                
                result = await bitmartService.getHistoryOrders(historyParams);
                break;
            default:
                return res.status(400).json({ success: false, message: 'Invalid order status' });
        }

        res.status(200).json(result);
        
    } catch (error) {
        // --- CÓDIGO CORREGIDO PARA MOSTRAR DETALLES DEL ERROR ---
        console.error('Error al obtener órdenes. Detalles:', error.response ? error.response.data : error.message);

        // Envía un mensaje de error más específico al cliente
        let errorMessage = 'Error al obtener órdenes. Por favor, revisa tus API Keys.';
        if (error.response && error.response.data) {
            errorMessage = error.response.data.message || errorMessage;
        } else {
            errorMessage = error.message || errorMessage;
        }
        
        res.status(500).json({ success: false, message: errorMessage });
    }
});

app.get('/api/bitmart-data', async (req, res) => {
    try {
        const isValid = await bitmartService.validateApiKeys();
        if (!isValid) {
            return res.status(401).json({ message: 'BitMart API keys are not valid.', connected: false });
        }
        const balance = await bitmartService.getBalance();
        const openOrders = await bitmartService.getOpenOrders('BTC_USDT');
        
        const ticker = { data: { last: currentMarketPrice } };

        res.status(200).json({
            message: 'BitMart data retrieved successfully.',
            connected: true,
            balance: balance,
            openOrders: openOrders.orders,
            ticker: ticker && ticker.data ? ticker.data : null,
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
        const { strategy, stopAtCycle, ...config } = req.body;
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
        
        botState.config = botState.config || {};
        botState.config.long = botState.config.long || {};
        botState.config.short = botState.config.short || {};
        
        botState.config.long = { ...botState.config.long, ...config.long };
        botState.config.short = { ...botState.config.short, ...config.short };

        if (strategy === 'long') {
            botState.config.long.enabled = true;
            botState.config.short.enabled = false;
            botState.lstate = 'RUNNING';
            botState.sstate = 'STOPPED';
        } else if (strategy === 'short') {
            botState.config.long.enabled = false;
            botState.config.short.enabled = true;
            botState.sstate = 'RUNNING';
            botState.lstate = 'STOPPED';
        }

        botState.config.stopAtCycle = stopAtCycle;
        
        await botState.save();

        autobotLogic.log(`Estrategia Autobot ${strategy} activada.`, 'success');
        res.json({ success: true, message: 'Autobot strategy started.' });
    } catch (error) {
        console.error('Failed to start Autobot strategy:', error);
        res.status(500).json({ success: false, message: 'Failed to start Autobot strategy.' });
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

app.get('/', (req, res) => {
    res.send('Backend is running!');
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    checkTimeSync();
});