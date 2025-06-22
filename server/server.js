// server/server.js

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http'); // Necesario para integrar Socket.IO con Express
const { Server } = require('socket.io'); // Importar Server de socket.io

require('dotenv').config(); // Cargar variables de entorno desde .env si es local

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const autobotLogic = require('./autobotLogic'); // Importar la lógica del autobot

const app = express();
const server = http.createServer(app); // Crear servidor HTTP con Express app
const io = new Server(server, { // Configurar Socket.IO con el servidor HTTP
    cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000", // Permitir conexión desde tu frontend
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true // Importante para que las cookies/tokens se envíen
}));
app.use(express.json()); // Para parsear cuerpos de solicitud JSON

// Conexión a MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Conectado a MongoDB correctamente'))
    .catch(err => console.error('❌ Error de conexión a MongoDB:', err));

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes); // Añadir rutas de usuario para la API de BitMart y el bot

// Ruta de prueba para verificar la conexión del backend
app.get('/ping', (req, res) => {
    // CAMBIO MÍNIMO PARA FORZAR DESPLIEGUE - Puedes quitar este comentario después de que funcione.
    // console.log("Ping successful!");
    res.status(200).json({ status: 'ok', message: 'Backend is live!' });
});

// Iniciar Socket.IO y pasarle la instancia de IO al autobotLogic
autobotLogic.init(io);
console.log('[AUTOBOT] Socket.IO instance attached to autobotLogic.');


const PORT = process.env.PORT || 10000;
server.listen(PORT, () => { // Usar server.listen en lugar de app.listen para Socket.IO
    console.log(`🚀 Backend server running on http://localhost:${PORT}`);
});

// Nota para Render: Asegúrate de que el comando de inicio en Render sea `node server.js`
