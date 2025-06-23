// server/server.js

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

// Import your services and models
const bitmartService = require('./services/bitmartService');
const BotState = require('./models/BotState'); // Your updated BotState model
const BotManager = require('./utils/BotManager'); // Your new BotManager

// Load environment variables
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*", // Adjust this to your frontend URL in production
        methods: ["GET", "POST"]
    }
});

// Set the Socket.IO instance in the BotManager
BotManager.setIo(io);

// Middleware
app.use(cors());
app.use(express.json()); // For parsing application/json

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, '../public')));

// --- Database Connection ---
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected successfully'))
.catch(err => console.error('MongoDB connection error:', err));

// --- Authentication Middleware (PLACEHOLDER) ---
// IMPORTANT: Replace this with your actual user authentication logic.
// This middleware should extract the userId and apiCredentials from the request.
// For demonstration, we'll use hardcoded values or pass them directly in the request body/headers.
// In a real app, you'd verify a JWT token and look up user credentials in your User model.
const authenticateUser = async (req, res, next) => {
    // For now, we'll assume a 'userId' and 'apiCredentials' are sent in the request body for simplicity.
    // In production, NEVER send API keys directly from the frontend like this.
    // They should be securely stored on the backend and associated with the authenticated user.

    // If you have a user session/JWT, you would do:
    // const userId = req.user.id;
    // const userApiCredentials = await User.findById(userId).select('bitmartApiKey bitmartApiSecret bitmartMemo');

    // PLACEHOLDER: For testing without a full auth system, get from headers or body
    const userId = req.headers['x-user-id'] || req.body.userId; // Prefer header for security
    const apiKey = req.headers['x-api-key'] || req.body.apiKey;
    const apiSecret = req.headers['x-api-secret'] || req.body.apiSecret;
    const memo = req.headers['x-api-memo'] || req.body.memo;

    if (!userId || !apiKey || !apiSecret) {
        return res.status(401).json({ message: 'Authentication required: userId, API Key, and Secret are missing.' });
    }

    req.userId = userId;
    req.apiCredentials = { apiKey, apiSecret, memo };
    next();
};

// --- API Routes ---

// Route to get a bot's current state
app.get('/api/bot/:botType/state', authenticateUser, async (req, res) => {
    const { botType } = req.params;
    const { userId, apiCredentials } = req;

    try {
        const botState = await BotManager.getBotState(userId, botType, apiCredentials);
        if (botState) {
            res.json({ success: true, state: botState });
        } else {
            res.status(404).json({ success: false, message: `No state found for ${botType} for this user.` });
        }
    } catch (error) {
        console.error(`Error getting ${botType} state for user ${userId}:`, error.message);
        res.status(500).json({ success: false, message: `Failed to retrieve ${botType} state.` });
    }
});

// Route to start a bot
app.post('/api/bot/:botType/start', authenticateUser, async (req, res) => {
    const { botType } = req.params;
    const { userId, apiCredentials } = req;
    const params = req.body.settings || {}; // Pass settings from frontend for Autobot/AIBot

    try {
        const result = await BotManager.startBot(userId, botType, apiCredentials, params);
        if (result.success) {
            res.json({ success: true, message: `${botType} started successfully.`, state: result.botState });
        } else {
            res.status(400).json({ success: false, message: result.message, state: result.botState });
        }
    } catch (error) {
        console.error(`Error starting ${botType} for user ${userId}:`, error.message);
        res.status(500).json({ success: false, message: `Failed to start ${botType}.` });
    }
});

// Route to stop a bot
app.post('/api/bot/:botType/stop', authenticateUser, async (req, res) => {
    const { botType } = req.params;
    const { userId } = req; // apiCredentials not strictly needed for stopping

    try {
        const result = await BotManager.stopBot(userId, botType);
        if (result.success) {
            res.json({ success: true, message: `${botType} stopped successfully.`, state: result.botState });
        } else {
            res.status(400).json({ success: false, message: result.message, state: result.botState });
        }
    } catch (error) {
        console.error(`Error stopping ${botType} for user ${userId}:`, error.message);
        res.status(500).json({ success: false, message: `Failed to stop ${botType}.` });
    }
});

// UPDATED: Route to extend AIBot license with verification
app.post('/api/aibot/license/extend', authenticateUser, async (req, res) => {
    const { userId, apiCredentials } = req;
    const { amount, transactionId, sourceWallet, currency, network } = req.body;

    if (typeof amount !== 'number' || amount <= 0 || !transactionId || !sourceWallet || !currency || !network) {
        return res.status(400).json({ success: false, message: 'Parámetros de pago incompletos o inválidos.' });
    }

    console.log(`[Server] User ${userId} attempting to extend AIBot license with ${amount} ${currency} (TxID: ${transactionId}).`);

    try {
        const result = await BotManager.extendAIBotLicense(userId, apiCredentials, amount, transactionId, sourceWallet, currency, network);
        if (result.success) {
            res.json({ success: true, message: result.message, daysRemaining: result.daysRemaining });
        } else {
            res.status(400).json({ success: false, message: result.message });
        }
    } catch (error) {
        console.error(`Error extendiendo licencia del AIBot para el usuario ${userId}:`, error.message);
        res.status(500).json({ success: false, message: 'Fallo al extender la licencia del AIBot.' });
    }
});

// NUEVA RUTA TEMPORAL: Para activar la licencia de prueba (¡ELIMINAR EN PRODUCCIÓN!)
app.post('/api/aibot/license/activate-test', authenticateUser, async (req, res) => {
    const { userId, apiCredentials } = req;
    console.warn(`[Server] ¡ADVERTENCIA! Activando licencia de prueba para el usuario ${userId}.`);
    try {
        const result = await BotManager.activateTestAIBotLicense(userId, apiCredentials);
        if (result.success) {
            res.json({ success: true, message: result.message });
        } else {
            res.status(400).json({ success: false, message: result.message });
        }
    } catch (error) {
        console.error(`Error activando licencia de prueba para el usuario ${userId}:`, error.message);
        res.status(500).json({ success: false, message: 'Fallo al activar la licencia de prueba.' });
    }
});

// --- Socket.IO Connection Handling ---
io.on('connection', (socket) => {
    console.log('A user connected via Socket.IO');

    // IMPORTANT: Authenticate Socket.IO connections too!
    // For simplicity, we'll listen for a 'join' event with userId.
    // In a real app, you'd use JWTs for Socket.IO authentication.
    socket.on('join', async (data) => {
        const { userId } = data;
        if (userId) {
            socket.join(userId); // Join a room specific to the user
            console.log(`User ${userId} joined their Socket.IO room.`);
            // Emit current states to the newly joined user
            // You'll need to load API credentials for this user here if not already available
            // For now, let's assume they might be re-fetched or already in session
            const dummyCredentials = { apiKey: 'dummy', apiSecret: 'dummy', memo: 'dummy' }; // Placeholder

            try {
                const autobotState = await BotManager.getBotState(userId, 'autobot', dummyCredentials);
                if (autobotState) {
                    socket.emit('botStateUpdate', { autobot: autobotState });
                }
                const aibotState = await BotManager.getBotState(userId, 'aibot', dummyCredentials);
                if (aibotState) {
                    socket.emit('botStateUpdate', { aibot: aibotState });
                }
            } catch (error) {
                console.error(`Error emitting initial states to user ${userId}:`, error.message);
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected from Socket.IO');
    });
});

// --- Start the Server ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Access frontend at http://localhost:${PORT}`);
});