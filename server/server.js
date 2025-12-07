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
const { calculateLongCoverage, calculatePotentialProfit /*, calculateShortCoverage*/ } = require('./autobotCalculations');

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
const analyticsRoutes = require('./routes/analyticsRoutes'); // 💡 NUEVAS RUTAS DE ANALÍTICAS

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

// -------------------------------------------------------------
// === [ INICIALIZACIÓN DE WEBSOCKETS DE ÓRDENES ] =================
// -------------------------------------------------------------
const handleOrderUpdate = (ordersData) => {
    // ordersData es un array de órdenes (abiertas/llenadas/canceladas)
    // Usamos 'open-orders-update' para enviar la data al frontend
    console.log(`[Socket.io] Retransmitiendo ${ordersData.length} órdenes abiertas/actualizadas.`);
    io.sockets.emit('open-orders-update', ordersData);
};

// 💡 Conectar con BitMart para el stream de Órdenes de Usuario
bitmartService.initOrderWebSocket(handleOrderUpdate);
// -------------------------------------------------------------

// 🛑 CORRECCIÓN #1: Configuración de CORS para solicitudes HTTP/REST
const allowedOrigins = [
    'https://bsb-lime.vercel.app', // Dominio de tu Front-end
    'http://localhost:3000',        // Desarrollo local
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
app.use('/api/v1/bot-state', balanceRoutes);

// 💡 NUEVAS RUTAS DE ANALÍTICAS
app.use('/api/v1/analytics', analyticsRoutes); 

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
        const currentPrice = parseFloat(price);

        if (!botState || isNaN(currentPrice) || currentPrice <= 0) {
            return;
        }

        let updatedBotState = botState;
        
        // Tasa de comisión (ej: 0.1% = 0.001). Asegúrate de que este campo exista en tu config.
        // Si no existe, usa un valor por defecto seguro (0.001 para 0.1%)
        const FEE_RATE = botState.config.long.feeRate || 0.001; 

        // 🎯 1. CALCULAR EL L-PROFIT POTENCIAL (Se calcula en cada tick, independientemente del estado)
        const lprofit = calculatePotentialProfit(
            botState.lStateData.ppc, 
            botState.lStateData.ac, 
            currentPrice, 
            FEE_RATE 
        );
        
        const updateData = {
            lprofit: lprofit, // Siempre actualiza el profit potencial
            lastUpdateTime: new Date()
        };

        // 🛑 2. LÓGICA DE ACTUALIZACIÓN DE COBERTURA 🛑
        if (botState.lstate === 'STOPPED' || botState.lstate === 'NO_COVERAGE') {
            
            // Recalcula lcoverage y lnorder con el nuevo precio
            const { coveragePrice: lcoverage, numberOfOrders: lnorder } = calculateLongCoverage(
                botState.lbalance,
                currentPrice,
                botState.config.long.purchaseUsdt,
                botState.config.long.price_var / 100,
                botState.config.long.size_var / 100
            );

            // Inicializar scoverage y snorder (mantener el valor actual)
            const scoverage = botState.scoverage;
            const snorder = botState.snorder;
            
            // Combina los datos de lprofit con los datos de cobertura
            Object.assign(updateData, {
                lcoverage: lcoverage, // ACTUALIZACIÓN SOLO EN ESTADO DETENIDO
                lnorder: lnorder,
                scoverage: scoverage,
                snorder: snorder,
            });

        } else {
             // 💡 Si el bot está RUNNING/BUYING/SELLING, SOLO actualiza lprofit y la marca de tiempo.
             // lcoverage, ltprice, lnorder son gestionados por LBuying.js
        }
        
        // 🛑 3. GUARDADO ATÓMICO EN LA DB
        updatedBotState = await Autobot.findOneAndUpdate(
            { _id: botState._id },
            { $set: updateData }, // Usa el objeto de actualización preparado
            { new: true } // Devuelve el documento actualizado
        );
        
        // 🚨 CRÍTICO: Asegurarse de que el objeto updatedBotState sea válido para la emisión.
        if (!updatedBotState) {
            console.error('No se pudo encontrar o actualizar el documento del bot.');
            return;
        }

        // === [ Emisión Inmediata de los Datos ] ===
        // Emitimos el estado actual (ya sea el recién actualizado o el que estaba en la DB)
        io.sockets.emit('bot-state-update', {
            lstate: updatedBotState.lstate,
            sstate: updatedBotState.sstate,
            total_profit: updatedBotState.total_profit || 0,
            lbalance: updatedBotState.lbalance || 0,
            sbalance: updatedBotState.sbalance || 0,
            ltprice: updatedBotState.ltprice || 0,
            stprice: updatedBotState.stprice || 0,
            lsprice: updatedBotState.lsprice || 0,
            sbprice: updatedBotState.sbprice || 0,
            lcycle: updatedBotState.lcycle || 0,
            scycle: updatedBotState.scycle || 0,
            lcoverage: updatedBotState.lcoverage || 0, 
            scoverage: updatedBotState.scoverage || 0,
            lnorder: updatedBotState.lnorder || 0,
            snorder: updatedBotState.snorder || 0,
            lprofit: updatedBotState.lprofit || 0 // ⬅️ NUEVO: Emitir lprofit
        });
        // ==========================================================
        
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

// 🛑 MODIFICACIÓN DEL BUCLE LENTO: Llama a la API solo para actualizar la CACHÉ en DB
// Frecuencia segura para BitMart: 10,000ms (10 segundos)
setInterval(async () => {
    // 1. Llama a la API de BitMart para actualizar el CACHÉ en DB (campo lastAvailableUSDT/BTC)
    await autobotLogic.slowBalanceCacheUpdate();
    
    // 2. Lee el documento de la DB actualizado
    const botState = await Autobot.findOne({});

    // 3. Emite los balances a la UI a través de un nuevo evento de Socket.IO
    if (botState && botState.lastAvailableUSDT !== undefined) {
        io.sockets.emit('balance-update', { // ⬅️ Nuevo evento 'balance-update'
            lastAvailableUSDT: botState.lastAvailableUSDT || 0,
            lastAvailableBTC: botState.lastAvailableBTC || 0,
        });
    }

}, 10000); // Mantenemos 10 segundos para el caché de balance.

// ** NUEVO BUCLE PARA ÓRDENES ABIERTAS (POLLING) **
// CRÍTICO para sincronizar el estado inicial y como fallback
setInterval(async () => {
    try {
        // Asumimos que el símbolo principal es 'BTC_USDT'
        const symbol = 'BTC_USDT'; 
        // Esta función debe existir en bitmartService.js y retornar [orden1, orden2, ...]
        const openOrders = await bitmartService.getOpenOrders(symbol); 
        
        if (openOrders) {
//            console.log(`[Polling] ${openOrders.length} Órdenes abiertas encontradas. Emitiendo.`);
            // Usamos el mismo evento que el WebSocket para un manejo consistente en el frontend
            io.sockets.emit('open-orders-update', openOrders); 
        }
        
    } catch (error) {
        // Evitamos que un error de polling detenga el servidor
        console.error('Error al consultar órdenes abiertas por polling:', error.message);
        // Opcional: Emitir un log de error al frontend
        io.sockets.emit('bot-log', {
            type: 'error',
            message: `Error al sincronizar órdenes abiertas: ${error.message.substring(0, 50)}...`
        });
    }

}, 5000); // Consultamos cada 5 segundos

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    checkTimeSync();
});