const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");

const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

// Importa el nuevo gestor de estado (donde ocurre la verificación y creación)
const { loadBotState } = require('./autobotStateManager'); 

// Servicios y Lógica del Bot
const bitmartService = require('./services/bitmartService');
const autobotLogic = require('./autobotLogic.js');
const checkTimeSync = require('./services/check_time');

// Importa las funciones de cálculo
const { calculateLongCoverage /*, calculateShortCoverage*/ } = require('./autobotCalculations');

// Modelos
const Order = require('./models/Order');
const Autobot = require('./models/Autobot'); // Se usará para loadBotState

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

// ** PUNTO DE VERIFICACIÓN Y CREACIÓN **
// Conexión a la Base de Datos e Inicialización del Estado
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected...');

        // 🛑 PASO CLAVE: LLAMA A LA LÓGICA DE BÚSQUEDA/CREACIÓN AQUÍ
        // Esto garantiza que el documento de estado exista antes de que cualquier otra
        // función lo intente leer (como updateBotStateWithPrice o botCycle)
        const initialBotState = await loadBotState(Autobot);

        // Opcional: Si autobotLogic necesita el estado inicial, se lo puedes pasar:
        // autobotLogic.setInitialState(initialBotState);

    } catch (err) {
        console.error('MongoDB connection or State Initialization error:', err.message);
        process.exit(1);
    }
};

// Llama a la conexión e inicialización
connectDB();
// **********************************************

let currentMarketPrice = 'N/A';

// **FUNCIÓN CORREGIDA: Ahora usa findOneAndUpdate para la actualización atómica y parcial.**
// NOTA: Esta función ahora está segura de que el documento de estado existe.
async function updateBotStateWithPrice(price) {
    try {
        // ** Cambio Importante: Usar findOne en lugar de findOne({}).findOne({}) puede devolver un cursor **
        // Como el documento fue creado con name: 'BSB-PPeX', ahora podemos usarlo
        const botState = await Autobot.findOne({ name: 'BSB-PPeX' });

        if (botState) {
            
            // Recalcula lcoverage y lnorder con el nuevo precio
            const { coveragePrice: lcoverage, numberOfOrders: lnorder } = calculateLongCoverage(
                botState.lbalance,
                parseFloat(price),
                botState.config.long.purchaseUsdt,
                botState.config.long.price_var / 100,
                botState.config.long.size_var / 100
            );

            // Se mantiene el estado actual para la corta hasta que se implemente el cálculo
            const scoverage = botState.scoverage;
            const snorder = botState.snorder;

            // 🛑 CAMBIO CLAVE: Usamos findOneAndUpdate para actualizar SOLO los campos de cobertura.
            const updatedBotState = await Autobot.findOneAndUpdate(
                { _id: botState._id },
                {
                    $set: {
                        lcoverage: lcoverage,
                        lnorder: lnorder,
                        scoverage: scoverage,
                        snorder: snorder,                                  
                        lastUpdateTime: new Date()
                    }
                },
                { new: true } // Devuelve el documento actualizado
            );
            
            if (!updatedBotState) {
                console.error('No se pudo encontrar o actualizar el documento del bot.');
                return;
            }

            // === [ Emisión Inmediata de los Datos ] ===
            // Usamos el documento updatedBotState (que contiene todos los datos)
            io.sockets.emit('bot-state-update', {
                lstate: updatedBotState.lstate,
                sstate: updatedBotState.sstate,
                total_profit: updatedBotState.total_profit || 0,
                lbalance: updatedBotState.lbalance || 0,
                sbalance: updatedBotState.sbalance || 0,
                ltprice: updatedBotState.ltprice || 0,
                stprice: updatedBotState.stprice || 0,
                lcycle: updatedBotState.lcycle || 0,
                scycle: updatedBotState.scycle || 0,
                lcoverage: updatedBotState.lcoverage || 0,
                scoverage: updatedBotState.scoverage || 0,
                lnorder: updatedBotState.lnorder || 0,
                snorder: updatedBotState.snorder || 0
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

                // Llama a la función CORREGIDA para recalcular, guardar Y EMITIR
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

// Bucle para actualizar balances (Ciclo LENTO: cada 5 segundos)
setInterval(async () => {
    // LLama al nuevo ciclo lento para obtener y emitir balances a la UI.
    await autobotLogic.balanceCycle();
}, 5000);

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    checkTimeSync();
});