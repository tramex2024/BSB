const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const bitmartService = require('./services/bitmartService');
const Order = require('./models/Order');
const Autobot = require('./models/Autobot');
const http = require('http');
const { Server } = require("socket.io");
const autobotLogic = require('./autobotLogic.js');
const { runLongStrategy, setDependencies: setLongDependencies } = require('./src/longStrategy');
const { runShortStrategy, setDependencies: setShortDependencies } = require('./src/shortStrategy');
const jwt = require('jsonwebtoken');
const axios = require('axios'); // Asegúrate de que axios esté instalado

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*", // Permite cualquier origen por ahora para pruebas
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

// --- ÚNICO INTERVALO PARA OBTENER Y EMITIR EL PRECIO ---
// Esta es la parte CRÍTICA. He consolidado la lógica aquí.
setInterval(async () => {
    try {
        // Usa tu servicio de Bitmart para obtener el ticker
        const tickerData = await bitmartService.getTicker('BTC_USDT');
        
        // Verifica si los datos son válidos
        if (tickerData && tickerData.data && tickerData.data.last) {
            const price = tickerData.data.last;
            console.log(`Backend: Precio de BTC obtenido: ${price}`);
            
            // Emite el precio a todos los clientes conectados
            io.emit('marketData', {
                price: price,
                symbol: 'BTC_USDT'
            });
            console.log('Backend: Evento "marketData" emitido.');
        } else {
            console.warn('Backend: Datos de ticker no válidos o vacíos.');
        }
    } catch (error) {
        console.error('Backend: Error en el ciclo de actualización del precio:', error.message);
    }
}, 500); // Emite el precio cada 0.5 segundos (500 ms)

// --- RUTAS DE LA API ---

// 1. Obtener precio en vivo (ticker)
app.get('/api/ticker/:symbol', async (req, res) => {
    try {
        const symbol = req.params.symbol;
        const tickerData = await bitmartService.getTicker(symbol);
        // Corrige el acceso a la propiedad 'last'
        if (tickerData && tickerData.data && tickerData.data.last) {
            const lastPrice = tickerData.data.last;
            res.status(200).json({ last: lastPrice });
        } else {
            res.status(404).json({ message: 'Ticker not found or invalid data', success: false });
        }
    } catch (error) {
        console.error('Error fetching ticker:', error.message);
        res.status(500).json({ message: 'Internal server error', success: false });
    }
});

// 2. Nuevo endpoint para obtener órdenes por status
app.get('/api/orders/:status', async (req, res) => {
    const { status } = req.params;
    
    const getBitMartOrders = async (orderStatus) => {
        switch(orderStatus) {
            case 'opened':
                return await bitmartService.getOpenOrders(bitmartCredentials, 'BTC_USDT');
            case 'filled':
            case 'cancelled':
            case 'all':
                return await bitmartService.getHistoryOrders(bitmartCredentials, 'BTC_USDT', 50, orderStatus);
            default:
                return { success: false, message: 'Invalid order status' };
        }
    };

    try {
        const result = await getBitMartOrders(status);
        if (result.success === false) {
            return res.status(400).json(result);
        }
        res.status(200).json({ success: true, orders: result.orders || result });
    } catch (error) {
        console.error(`Error fetching ${status} orders:`, error.message);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// 3. Endpoint principal de datos consolidados
app.get('/api/bitmart-data', async (req, res) => {
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
        // Corrige el acceso a la propiedad 'last'
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

// Nuevo Endpoint para el estado y configuración del bot
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

// Nuevo Endpoint para iniciar el Autobot con la configuración del frontend
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

// Ruta para detener el Autobot
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

// Ruta de prueba principal para verificar que el servidor está funcionando
app.get('/', (req, res) => {
    res.send('Backend is running!');
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});