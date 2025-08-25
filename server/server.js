const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const autobotLogic = require('./autobotLogic');
const bitmartService = require('./services/bitmartService');

// App and Middleware Configuration
app.use(express.json());
app.use(cors());

// Conexión a MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB Connected...'))
  .catch(err => console.error(err));

// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// =========================================================================
// Nuevo Endpoint para Obtener Órdenes Abiertas (CORREGIDO)
// =========================================================================

app.get('/api/open-orders', async (req, res) => {
    try {
        const authCredentials = {
            apiKey: process.env.BITMART_API_KEY,
            secretKey: process.env.BITMART_SECRET_KEY,
            memo: process.env.BITMART_API_MEMO,
        };
        const symbol = req.query.symbol || 'BTC_USDT';

        const { orders } = await bitmartService.getOpenOrders(authCredentials, symbol);

        res.status(200).json({ success: true, orders });
    } catch (error) {
        console.error('Error al obtener órdenes abiertas:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

// =========================================================================
// WebSocket and Server Logic
// =========================================================================

io.on('connection', (socket) => {
    console.log(`User connected with ID: ${socket.id}`);
    autobotLogic.setIo(io);

    socket.on('start-bot', async ({ botType, config }) => {
        try {
            await autobotLogic.start(botType, config);
            socket.emit('bot-log', { message: `Bot ${botType} started.`, type: 'success' });
        } catch (error) {
            console.error(error);
            socket.emit('bot-log', { message: `Error starting bot ${botType}: ${error.message}`, type: 'error' });
        }
    });

    socket.on('stop-bot', async () => {
        try {
            await autobotLogic.stop();
            socket.emit('bot-log', { message: 'Bot stopped.', type: 'info' });
        } catch (error) {
            console.error(error);
            socket.emit('bot-log', { message: `Error stopping bot: ${error.message}`, type: 'error' });
        }
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected with ID: ${socket.id}`);
    });
});

// =========================================================================
// Ciclo Principal del Bot (Si tienes un ciclo en server.js)
// =========================================================================
const SYMBOL = process.env.SYMBOL || 'BTC_USDT';

// Ciclo para obtener datos de mercado
setInterval(async () => {
  try {
    const ticker = await bitmartService.getTicker(SYMBOL);
    if (ticker) {
      io.emit('marketData', {
        price: ticker.last_price,
        // Aquí puedes agregar otros datos si tu frontend los necesita
        // como los balances
        usdt: 'N/A', // Estos se obtienen por separado en autobotLogic.js
        btc: 'N/A'
      });
    }
  } catch (error) {
    console.error('Error al obtener el ticker del mercado:', error.message);
  }
}, 15000); // Cambiado a 15 segundos para evitar el error 429

// Ciclo para el bot
const BOT_CYCLE_INTERVAL = process.env.BOT_CYCLE_INTERVAL || 15000;
setInterval(async () => {
  try {
    // Aquí puedes llamar a una función que inicie el ciclo del bot
    // por ejemplo, la función que llama a autobotLogic.botCycle()
    // Si tu lógica está en server.js, asegúrate de que esté aquí.
    
    // Si la lógica del ciclo del bot está en otro lado,
    // este es el lugar donde se invoca.
    
  } catch (error) {
    console.error(`Error en el ciclo del bot: ${error.message}`);
  }
}, BOT_CYCLE_INTERVAL);


// Run server
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));