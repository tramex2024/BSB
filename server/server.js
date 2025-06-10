const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const FRONTEND_URL = process.env.FRONTEND_URL || "https://bsb-lime.vercel.app";

const io = new socketIo.Server(server, {
    cors: {
        origin: FRONTEND_URL,
        methods: ["GET", "POST"]
    }
});

app.use(cors({
    origin: FRONTEND_URL,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    optionsSuccessStatus: 204
}));
app.use(express.json());

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const BotState = require('./models/BotState');
const autobotLogic = require('./autobotLogic');

autobotLogic.setIoInstance(io);

const port = process.env.PORT || 3001;

mongoose.connect(process.env.MONGO_URI, { dbName: 'bsb' })
    .then(async () => {
        console.log('✅ Conectado a MongoDB correctamente');
        await autobotLogic.loadBotStateFromDB();
    })
    .catch(error => {
        console.error('❌ Error conectando a MongoDB:', error.message);
        process.exit(1);
    });

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);

app.get('/api/bot-state', (req, res) => {
    if (!autobotLogic.botState) {
        console.error('[SERVER] Error: botState es undefined.');
        return res.status(500).json({ success: false, message: 'Bot state is undefined.' });
    }
    res.json({ ...autobotLogic.botState });
});

app.post('/api/toggle-bot', async (req, res) => {
    if (!autobotLogic.botState) {
        console.error('[SERVER] botState es undefined.');
        return res.status(500).json({ success: false, message: 'Bot state is undefined.' });
    }

    const { action, params } = req.body;
    console.log(`[SERVER] Recibida solicitud para /api/toggle-bot: ${action}`);

    try {
        const response = action === 'start' 
            ? await autobotLogic.startBotStrategy(params) 
            : await autobotLogic.stopBotStrategy();

        res.json(response);
    } catch (error) {
        console.error('[SERVER] Error en toggle-bot:', error);
        res.status(500).json({ success: false, message: `Server error: ${error.message}` });
    }
});

server.listen(port, () => {
    console.log(`🚀 Backend server running on http://localhost:${port}`);
});
