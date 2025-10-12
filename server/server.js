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

// Importa las funciones de cálculo
const { calculateLongCoverage, calculateShortCoverage } = require('./autobotCalculations');

// Modelos
const Order = require('./models/Order');
const Autobot = require('./models/Autobot');

// Routers
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const ordersRoutes = require('./routes/ordersRoutes');
const autobotRoutes = require('./routes/autobotRoutes');
const configRoutes = require('./routes/configRoutes');
const balanceRoutes = require('./routes/balanceRoutes');

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
app.use('/api/autobot', autobotRoutes);
app.use('/api/v1/config', configRoutes);
app.use('/api/v1/balances', balanceRoutes);

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

// **FUNCIÓN MODIFICADA: Ahora recalcula, guarda Y EMITE el estado del bot.**
async function updateBotStateWithPrice(price) {
    try {
        const botState = await Autobot.findOne({});
        if (botState) {
            // Recalcula lcoverage y lnorder con el nuevo precio
            const { coveragePrice: lcoverage, numberOfOrders: lnorder } = calculateLongCoverage(
                botState.lbalance,
                parseFloat(price),
                botState.config.long.purchaseUsdt,
                botState.config.long.price_var / 100,
                botState.config.long.size_var / 100
            );

            // Recalcula scoverage y snorder
            const { coveragePrice: scoverage, numberOfOrders: snorder } = calculateShortCoverage(
                botState.sbalance,
                parseFloat(price),
                botState.config.short.sellBtc,
                botState.config.short.price_var / 100,
                botState.config.short.size_var / 100
            );

            // Actualiza los valores en el objeto y guarda en la base de datos
            botState.lcoverage = lcoverage;
            botState.lnorder = lnorder;
            botState.scoverage = scoverage;
            botState.snorder = snorder;
            await botState.save();

            // === [ CAMBIO CLAVE #1: Emisión Inmediata de los Datos ] ===
            // Los datos se emiten AHORA, justo después de ser guardados, eliminando el retardo.
            io.sockets.emit('bot-state-update', {
                lstate: botState.lstate,
                sstate: botState.sstate,
                profit: botState.profit || 0,
                lbalance: botState.lbalance || 0,
                sbalance: botState.sbalance || 0,
                ltprice: botState.ltprice || 0,
                stprice: botState.stprice || 0,
                lcycle: botState.lcycle || 0,
                scycle: botState.scycle || 0, // Corregí 'syle' a 'scycle' (asumo que era un typo)
                lcoverage: botState.lcoverage || 0,
                scoverage: botState.scoverage || 0,
                lnorder: botState.lnorder || 0,
                snorder: botState.snorder || 0
            });
            // ==========================================================

        }
    } catch (error) {
        console.error('Error al actualizar el estado del bot con el nuevo precio:', error);
    }
}

// Configuración de WebSocket para datos de mercado
const bitmartWsUrl = 'wss://ws-manager-compress.bitmart.com/api?protocol=1.1&compression=true';
function setupWebSocket(io) {
    const ws = new WebSocket(bitmartWsUrl);
    ws.onopen = function() {
        console.log("Conectado a la API de WebSocket de BitMart.");
        const subscribeMessage = { "op": "subscribe", "args": ["spot/ticker:BTC_USDT"] };
        ws.send(JSON.stringify(subscribeMessage));
    };
    ws.onmessage = async function(event) {
        try {
            const data = JSON.parse(event.data);
            if (data && data.data && data.data.length > 0 && data.data[0].symbol === 'BTC_USDT') {
                currentMarketPrice = data.data[0].last_price;
                io.emit('marketData', { price: currentMarketPrice });

                // Llama a la nueva función para recalcular, guardar Y EMITIR
                await updateBotStateWithPrice(currentMarketPrice);

		// Disparar el ciclo de la estrategia en tiempo real (debe ser el último paso)
        await autobotLogic.botCycle(currentMarketPrice);
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

// === [ CAMBIO CLAVE #2: Se ELIMINA el bucle principal de 3 segundos ] ===
// Ahora el estado del bot se emite de forma inmediata dentro de updateBotStateWithPrice.
// La eliminación de este bloque evita la doble lectura de la DB y la latencia.
/*
setInterval(async () => {
    try {
        const botState = await Autobot.findOne({});
        // ... código de emisión eliminado ...
    } catch (error) {
        console.error('Error al emitir el estado del bot:', error);
    }
}, 3000);
*/
// =========================================================================


// Endpoint de la API
app.get('/api/ticker/:symbol', (req, res) => {
// ... (código sin cambios) ...
});

app.get('/api/bitmart-data', async (req, res) => {
// ... (código sin cambios) ...
});

app.get('/api/user/bot-config-and-state', async (req, res) => {
// ... (código sin cambios) ...
});

app.get('/', (req, res) => {
    res.send('Backend is running!');
});

// Bucle para actualizar balances (Ciclo LENTO: cada 5 segundos)
setInterval(async () => {
    // LLama al nuevo ciclo lento para obtener y emitir balances a la UI.
    await autobotLogic.balanceCycle();
}, 5000);

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    checkTimeSync();
});