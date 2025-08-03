// server.js (VERSION CON ENDPOINTS DE BACKEND PARA EL FRONTEND)

const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const bitmartService = require('./services/bitmartService');
const Order = require('./models/Order');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Conexión a MongoDB
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected...');
    } catch (err) {
        console.error('MongoDB connection error:', err.message);
        process.exit(1);
    }
};

// Conectarse a la DB al iniciar el servidor
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
        const ticker = await bitmartService.getTicker(symbol);
        // La API de BitMart v3 devuelve un array, por lo que tomamos el primer elemento.
        // Asumiendo que el formato es `data: [{ last: "..." }]`
        if (ticker && ticker.data && ticker.data.length > 0) {
            res.status(200).json(ticker.data[0]);
        } else {
            res.status(404).json({ message: 'Ticker not found', success: false });
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

// 3. Endpoint principal de datos consolidados (ya lo tenías, lo mantendremos)
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
            // Asumiendo que el formato de ticker es `data: [{ last: "..." }]`
            ticker: ticker && ticker.data && ticker.data.length > 0 ? ticker.data[0] : null,
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

// Ruta de prueba principal para verificar que el servidor está funcionando
app.get('/', (req, res) => {
    res.send('Backend is running!');
});

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});