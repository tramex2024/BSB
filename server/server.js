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

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB Connected...'))
  .catch(err => console.error(err));

// API Routes
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

        // Llama a la función getOpenOrders que ya corregimos en bitmartSpot.js
        const { orders } = await bitmartService.getOpenOrders(authCredentials, symbol);

        // Envía la respuesta al frontend
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
  console.log('User connected with ID:', socket.id);
  autobotLogic.setIo(io);

  // Example: Initial data sync when a user connects
  socket.on('initial-data-request', async () => {
    try {
      // You can send initial balances, bot status, etc.
      // This is a good place to send the open orders data to the frontend
      const authCredentials = {
        apiKey: process.env.BITMART_API_KEY,
        secretKey: process.env.BITMART_SECRET_KEY,
        memo: process.env.BITMART_API_MEMO,
      };
      const symbol = 'BTC_USDT'; // Or get it from the request if needed
      const { orders } = await bitmartService.getOpenOrders(authCredentials, symbol);
      
      socket.emit('open-orders-update', { success: true, orders });
    } catch (error) {
      console.error('Error sending initial data:', error.message);
      socket.emit('open-orders-update', { success: false, message: 'Failed to get orders' });
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected with ID:', socket.id);
  });
});

// Run server
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));