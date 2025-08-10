// server.js

const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const bitmartService = require('./services/bitmartService'); // Revisa que esta ruta sea correcta
const Order = require('./models/Order');
const { startAutobot } = require('./server/autobot.js');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware de CORS
const corsOptions = {
    origin: 'https://bsb-lime.vercel.app'
};
app.use(cors(corsOptions));

app.use(express.json());

// Conexión a MongoDB
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected...');
    } catch (err) {
        console.error('MongoDB connection error:', err.message);
        // Cierra el proceso si no se puede conectar a la DB
        process.exit(1); 
    }
};

connectDB();

// Credenciales de BitMart, obtenidas una sola vez.
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

        // Tu servicio ya retorna el objeto 'data' directamente, sin anidamiento.
        // Verificamos que el objeto no esté vacío y contenga la propiedad 'last'
        if (tickerData && tickerData.last) {
            // El frontend espera un objeto con la propiedad 'last'
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

// --- NUEVO ENDPOINT PARA EL ESTADO DEL BOT ---
// Este endpoint es el que faltaba y causaba el error 404.
app.get('/api/user/bot-config-and-state', (req, res) => {
    const botState = {
        state: 'STOPPED', 
        purchase: 5.00,
        increment: 100,
        decrement: 1.0,
        trigger: 1.5,
        stopAtCycleEnd: false,
        cycle: 0,
        profit: 0.00,
        cycleProfit: 0.00,
    };
    res.status(200).json(botState);
});

// Nueva ruta para iniciar el Autobot
app.post('/api/autobot/start', (req, res) => {
    try {
        // Llama a la función principal de tu estrategia
        startAutobot();
        // Responde al cliente que la estrategia se ha iniciado
        res.json({ success: true, message: 'Autobot strategy started.' });
    } catch (error) {
        console.error('Failed to start Autobot strategy:', error);
        res.status(500).json({ success: false, message: 'Failed to start Autobot strategy.' });
    }
});

// Ruta de prueba principal para verificar que el servidor está funcionando
app.get('/', (req, res) => {
    res.send('Backend is running!');
});

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});