// server.js (VERSION SEGURA SIN ORDENES DE PRUEBA)

const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const bitmartService = require('./services/bitmartService');
const Order = require('./models/Order'); // Todavía lo necesitamos si en el futuro se guardan órdenes desde autobotLogic

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors()); // CORS abierto para desarrollo, considera restringir en producción
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

// Ruta de prueba para BitMart API y conexión con Frontend
app.get('/test-bitmart', async (req, res) => {
    try {
        const authCredentials = {
            apiKey: process.env.BITMART_API_KEY,
            secretKey: process.env.BITMART_SECRET_KEY,
            apiMemo: process.env.BITMART_API_MEMO || ''
        };

        // PASO 1: Validar claves API
        console.log('\n--- Paso 1: Validando claves API ---');
        const isValid = await bitmartService.validateApiKeys(authCredentials.apiKey, authCredentials.secretKey, authCredentials.apiMemo);
        if (!isValid) {
            return res.status(401).json({ message: 'BitMart API keys are not valid. Check your .env file.' });
        }
        console.log('Claves API validadas con éxito.');

        // PASO 2: Obtener Balance
        console.log('\n--- Paso 2: Obteniendo Balance ---');
        const balance = await bitmartService.getBalance(authCredentials);
        console.log('Balance obtenido:', balance);

        // PASO 3: Obtener Órdenes Abiertas (sin cancelación)
        console.log('\n--- Paso 3: Obteniendo Órdenes Abiertas ---');
        const openOrders = await bitmartService.getOpenOrders(authCredentials, 'BTC_USDT'); // Puedes ajustar el símbolo
        console.log('Órdenes Abiertas:', openOrders.orders);

        // --- IMPORTANTE: Se ha eliminado la lógica de colocación de órdenes de prueba aquí ---
        // Esto previene cualquier transacción accidental durante la fase de conexión del frontend.

        res.status(200).json({
            message: 'BitMart API test completed (no orders placed). Backend connection successful.',
            balance: balance,
            openOrders: openOrders.orders,
            testOrder: null // Siempre será null en esta versión
        });

    } catch (error) {
        console.error('Error in /test-bitmart endpoint:', error.message);
        res.status(500).json({ message: 'Internal server error during BitMart test.', error: error.message });
    }
});


// Ruta principal para verificar que el servidor está funcionando
app.get('/', (req, res) => {
    res.send('Backend is running!');
});

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});