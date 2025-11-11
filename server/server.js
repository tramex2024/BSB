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
const { calculateLongCoverage /*, calculateShortCoverage*/ } = require('./autobotCalculations');

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

// Configuración de Socket.IO
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    path: '/socket.io'
});

autobotLogic.setIo(io);

// 🛑 CORRECCIÓN #1: Configuración de CORS para solicitudes HTTP/REST
const allowedOrigins = [
    'https://bsb-lime.vercel.app', // Dominio de tu Front-end
    'http://localhost:3000'        // Desarrollo local
];

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error(`CORS no permite el acceso desde el Origen: ${origin}`), false);
        }
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
    credentials: true,
    optionsSuccessStatus: 204
};

app.use(cors(corsOptions)); // Aplicamos la configuración de CORS
app.use(express.json()); // El parser JSON
// -------------------------------------------------------------

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

// 🛑 1. DEFINIR LA FUNCIÓN DE LECTURA DE ESTADO
async function getBotState() {
    return await Autobot.findOne({});
}

// 🛑 2. CREAR LAS CREDENCIALES/DEPENDENCIAS BASE
const botDependencies = {
    getBotState: getBotState, // <--- FUNCIÓN NECESARIA PARA LA PRUEBA DE AI
    // Aquí puedes añadir otras funciones que se usen globalmente, si es necesario.
};

let currentMarketPrice = 'N/A';

// **FUNCIÓN CORREGIDA: Ahora usa findOneAndUpdate para la actualización atómica y parcial.**
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

            // 🟢 CORRECCIÓN: Inicializar scoverage y snorder al valor actual de la DB
            const scoverage = botState.scoverage;
            const snorder = botState.snorder;

            // 🛑 CAMBIO CLAVE: Usamos findOneAndUpdate para actualizar SOLO los campos de cobertura.
            // Esto evita sobrescribir lStateData, lbalance, lstate, etc. con datos obsoletos.
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
            // Usamos el documento updatedBotState (que contiene todos los datos, incluyendo lStateData)
            io.sockets.emit('bot-state-update', {
                lstate: updatedBotState.lstate,
                sstate: updatedBotState.sstate,
                // 🚨 CORRECCIÓN CLAVE: Cambiamos 'profit' por 'total_profit' para que coincida con el front-end.
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
                
                // 🛑 CAMBIO CLAVE: Pasar las dependencias al botCycle
                await autobotLogic.botCycle(currentMarketPrice, botDependencies);
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

// --- LÓGICA DE CHEQUEO DE ESTADO Y EMISIÓN (SOLUCIÓN AL PROBLEMA) ---

/**
 * Chequea el estado de conexión a la API REST de BitMart llamando a una función que requiere 
 * autenticación (getBalance), y emite el resultado al frontend.
 * También llama a la lógica de actualización lenta después de un check exitoso.
 */
async function checkBitmartStatusAndEmit() {
    try {
        // Llama a una función que requiere credenciales. Si falla, va al catch.
        const balances = await bitmartService.getBalance();
        
        // La llamada a la API fue exitosa (código 200 o similar).
        io.emit('balance-real-update', {
            source: 'API_SUCCESS',
            // Opcional: balances: balances // Si el frontend necesita los datos reales
        });
        
        console.log('✅ BitMart API status check successful (API_SUCCESS).');
        
        // Si la conexión es exitosa, disparamos la actualización lenta de la caché del bot.
        // Asumimos que slowBalanceCacheUpdate usa los balances obtenidos o hace otra llamada.
        await autobotLogic.slowBalanceCacheUpdate();

    } catch (error) {
        // La llamada falló (credenciales incorrectas, rate limit, BitMart caído).
        io.emit('balance-real-update', {
            // Usamos 'CACHE_FALLBACK' para que el frontend lo marque como Advertencia/Amarillo
            source: 'CACHE_FALLBACK', 
        });
        
        // Nota: En caso de fallo, NO llamamos a slowBalanceCacheUpdate para evitar más errores.
        console.error('❌ BitMart API status check failed (CACHE_FALLBACK/Error):', error.message);
    }
}

// 🛑 Reemplazamos el antiguo setInterval. Ahora esta función maneja tanto el chequeo de estado
// para la bolita, como la llamada a la lógica de actualización lenta.
// Frecuencia: Cada 10 segundos.
setInterval(checkBitmartStatusAndEmit, 10000); 

// ------------------------------------------------------------------

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    checkTimeSync();
});