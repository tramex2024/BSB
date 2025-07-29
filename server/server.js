// server.js (VERSION SIN USUARIOS NI AUTENTICACION)

const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const bitmartService = require('./services/bitmartService');
// Ya no necesitamos el modelo Order aquí si no lo vamos a usar directamente en esta ruta,
// pero lo mantengo por si lo necesitas para el autobotLogic.js en el futuro.
// Si no lo vas a usar en este archivo para este objetivo, puedes quitar la línea.
const Order = require('./models/Order');

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

// Ruta de prueba principal para obtener datos de BitMart
// NOTA: Esta ruta ahora usa las API keys configuradas DIRECTAMENTE en el servidor (variables de entorno de Render)
app.get('/bitmart-data', async (req, res) => {
    try {
        // Credenciales de BitMart obtenidas directamente del archivo .env (en local)
        // o de las variables de entorno de Render (en producción)
        const authCredentials = {
            apiKey: process.env.BITMART_API_KEY,
            secretKey: process.env.BITMART_SECRET_KEY,
            apiMemo: process.env.BITMART_API_MEMO || ''
        };

        // PASO 1: Validar claves API
        console.log('\n--- Paso 1: Validando claves API ---');
        const isValid = await bitmartService.validateApiKeys(authCredentials.apiKey, authCredentials.secretKey, authCredentials.apiMemo);
        if (!isValid) {
            // Si las claves no son válidas, respondemos con un error
            return res.status(401).json({ message: 'BitMart API keys are not valid. Check server environment variables.', connected: false });
        }
        console.log('Claves API validadas con éxito. CONECTADO.');

        // PASO 2: Obtener Balance
        console.log('\n--- Paso 2: Obteniendo Balance ---');
        const balance = await bitmartService.getBalance(authCredentials);
        console.log('Balance obtenido:', balance);

        // PASO 3: Obtener Órdenes Abiertas
        console.log('\n--- Paso 3: Obteniendo Órdenes Abiertas (BTC_USDT) ---');
        const openOrders = await bitmartService.getOpenOrders(authCredentials, 'BTC_USDT'); // Ajusta el símbolo si es necesario
        console.log('Órdenes Abiertas:', openOrders.orders);

        // PASO 4: Obtener Precio en Vivo (Ticker)
        console.log('\n--- Paso 4: Obteniendo Ticker (BMX_USDT) ---'); // O el símbolo que te interese
        const ticker = await bitmartService.getTicker('BMX_USDT'); // Cambiado a BMX_USDT para que sea diferente al de órdenes
        console.log('Ticker obtenido:', ticker);

        // Respuesta consolidada al frontend
        res.status(200).json({
            message: 'BitMart data retrieved successfully. Backend is connected.',
            connected: true, // Indica que el backend pudo conectar a BitMart
            balance: balance,
            openOrders: openOrders.orders,
            ticker: ticker,
            // Aquí puedes añadir más datos que quieras exponer al frontend
        });

    } catch (error) {
        console.error('Error in /bitmart-data endpoint:', error.message);
        // Si hay un error, el backend no pudo conectar o las claves no son válidas
        res.status(500).json({
            message: 'Failed to retrieve BitMart data. Check server logs and API keys.',
            connected: false, // Indica fallo de conexión
            error: error.message
        });
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