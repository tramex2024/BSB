const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const bitmartService = require('./services/bitmartService');
const Order = require('./models/Order');
const Autobot = require('./models/Autobot');
const http = require('http');
const { Server } = require("socket.io");
const autobotLogic = require('./autobotLogic.js');
const { runLongStrategy, setDependencies: setLongDependencies } = require('./src/longStrategy');
const { runShortStrategy, setDependencies: setShortDependencies } = require('./src/shortStrategy');

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

const corsOptions = {
    origin: 'https://bsb-lime.vercel.app'
};
app.use(cors(corsOptions));
app.use(express.json());

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

io.on('connection', (socket) => {
    console.log(`User connected with ID: ${socket.id}`);
    socket.on('disconnect', () => {
        console.log(`User disconnected with ID: ${socket.id}`);
    });
});

const bitmartCredentials = {
    apiKey: process.env.BITMART_API_KEY,
    secretKey: process.env.BITMART_SECRET_KEY,
    apiMemo: process.env.BITMART_API_MEMO || ''
};

// **Inicio de la nueva función del ciclo del bot**
async function botCycle() {
    try {
        let botState = await Autobot.findOne({});
        
        // Si no hay estado en la base de datos, crea uno con valores por defecto
        if (!botState) {
            autobotLogic.log('Estado del bot no encontrado. Creando nuevo documento...', 'warning');
            const newBot = new Autobot({
                lstate: 'STOPPED',
                sstate: 'STOPPED',
                lStateData: { ppc: 0, ac: 0, orderCountInCycle: 0, lastOrder: null },
                sStateData: { ppv: 0, av: 0, orderCountInCycle: 0, lastOrder: null },
                config: {
                    symbol: "BTC_USDT",
                    long: {
                        enabled: false,
                        purchaseUsdt: 5.00,
                        price_var: 0.1,
                        size_var: 5.0,
                        trigger: 0.2,
                        maxOrders: 5
                    },
                    short: {
                        enabled: false,
                        sellBtc: 0.00004,
                        price_var: 0.1,
                        size_var: 5.0,
                        trigger: 0.2,
                        maxOrders: 5
                    },
                    stopAtCycle: false
                }
            });
            await newBot.save();
            botState = newBot; // Asignar el nuevo estado
            autobotLogic.log('Nuevo estado del bot creado. El bot está inactivo.', 'success');
        }

        // Asegurarse de que la configuración esté completa antes de continuar
        if (!botState.config || !botState.config.long || !botState.config.short) {
            autobotLogic.log('Configuración del bot incompleta. No se puede ejecutar el ciclo.', 'error');
            return;
        }

        // Pasar dependencias a las estrategias
        setLongDependencies(botState.config, bitmartCredentials, []);
        setShortDependencies(botState.config, bitmartCredentials, []);

        // Obtener datos del mercado y de la cuenta
        const balances = await bitmartService.getAccountBalances(bitmartCredentials);
        const ticker = await bitmartService.getTicker(botState.config.symbol);

        if (!balances || !ticker || !ticker.data || !ticker.data.last) {
            autobotLogic.log('No se pudo obtener información de mercado o de la cuenta.', 'error');
            return;
        }

        const currentPrice = parseFloat(ticker.data.last);
        const availableUSDT = parseFloat(balances.USDT.available);
        const availableBTC = parseFloat(balances.BTC.available);

        // Ejecutar las estrategias si están habilitadas en la configuración
        if (botState.config.long.enabled) {
            await runLongStrategy(botState, currentPrice, availableUSDT, availableBTC);
        }
        if (botState.config.short.enabled) {
            await runShortStrategy(botState, currentPrice, availableUSDT, availableBTC);
        }

    } catch (error) {
        autobotLogic.log(`Error en el ciclo principal del bot: ${error.message}`, 'error');
    }
}
// Iniciar el ciclo del bot cada 10 segundos
setInterval(botCycle, 10000);
// **Fin de la nueva función del ciclo del bot**

// 1. Obtener precio en vivo (ticker)
app.get('/ticker/:symbol', async (req, res) => {
    try {
        const symbol = req.params.symbol;
        const tickerData = await bitmartService.getTicker(symbol);
        if (tickerData && tickerData.data && tickerData.data.last) {
            res.status(200).json({ last: tickerData.data.last });
        } else {
            res.status(404).json({ message: 'Ticker not found or invalid data', success: false });
        }
    } catch (error) {
        console.error('Error fetching ticker:', error.message);
        res.status(500).json({ message: 'Internal server error', success: false });
    }
});

// 2. Obtener órdenes abiertas
app.get('/orders/opened', async (req, res) => {
    try {
        const openOrders = await bitmartService.getOpenOrders(bitmartCredentials, 'BTC_USDT');
        res.status(200).json(openOrders);
    } catch (error) {
        console.error('Error fetching open orders:', error.message);
        res.status(500).json({ message: 'Internal server error', success: false });
    }
});

// 3. Endpoint principal de datos consolidados
app.get('/bitmart-data', async (req, res) => {
    try {
        const isValid = await bitmartService.validateApiKeys(
            bitmartCredentials.apiKey,
            bitmartCredentials.secretKey,
            bitmartCredentials.apiMemo
        );
        if (!isValid) {
            return res.status(401).json({ message: 'BitMart API keys are not valid.', connected: false });
        }
        const balance = await bitmartService.getBalance(bitmartCredentials);
        const openOrders = await bitmartService.getOpenOrders(bitmartCredentials, 'BTC_USDT');
        const ticker = await bitmartService.getTicker('BTC_USDT');
        res.status(200).json({
            message: 'BitMart data retrieved successfully.',
            connected: true,
            balance: balance,
            openOrders: openOrders.orders,
            ticker: ticker && ticker.data && ticker.data.tickers && ticker.data.tickers.length > 0 ? ticker.data.tickers[0] : null,
        });
    } catch (error) {
        console.error('Error in /bitmart-data endpoint:', error.message);
        res.status(500).json({
            message: 'Failed to retrieve BitMart data. Check server logs and API keys.',
            connected: false,
            error: error.message
        });
    }
});

// Nuevo Endpoint para el estado y configuración del bot
app.get('/api/user/bot-config-and-state', async (req, res) => {
    try {
        const autobotConfig = await Autobot.findOne({});
        if (autobotConfig) {
            res.status(200).json({
                lstate: autobotConfig.lstate,
                sstate: autobotConfig.sstate,
                purchase: autobotConfig.config.long.purchaseUsdt,
                price_var: autobotConfig.config.long.price_var,
                size_var: autobotConfig.config.long.size_var,
                trigger: autobotConfig.config.long.trigger,
                stopAtCycle: autobotConfig.config.stopAtCycle,
                // Agregamos los campos de la estrategia short
                short: {
                    sellBtc: autobotConfig.config.short.sellBtc,
                    price_var: autobotConfig.config.short.price_var,
                    size_var: autobotConfig.config.short.size_var,
                    trigger: autobotConfig.config.short.trigger,
                },
                long: {
                    purchaseUsdt: autobotConfig.config.long.purchaseUsdt,
                    price_var: autobotConfig.config.long.price_var,
                    size_var: autobotConfig.config.long.size_var,
                    trigger: autobotConfig.config.long.trigger,
                },
            });
        } else {
            res.status(200).json({ lstate: 'STOPPED', sstate: 'STOPPED' });
        }
    } catch (error) {
        console.error('Error fetching bot state from DB:', error);
        res.status(500).json({ message: 'Internal server error', success: false });
    }
});

// 4. Nuevo Endpoint para obtener balances de la cuenta
app.get('/api/user/balances', async (req, res) => {
    try {
        const balances = await bitmartService.getBalance(bitmartCredentials);
        if (balances) {
            res.status(200).json({ success: true, wallet: balances });
        } else {
            res.status(404).json({ message: 'Balances not found or invalid data.', success: false });
        }
    } catch (error) {
        console.error('Error fetching balances:', error.message);
        res.status(500).json({ message: 'Internal server error', success: false });
    }
});

// Nuevo Endpoint para iniciar el Autobot con la configuración del frontend
app.post('/api/autobot/start', async (req, res) => {
    try {
        const { strategy, stopAtCycle, ...config } = req.body;
        let botState = await Autobot.findOne({});

        // Si no existe, crea un objeto de estado completo para evitar errores
        if (!botState) {
            botState = new Autobot({
                lstate: 'STOPPED',
                sstate: 'STOPPED',
                lStateData: {},
                sStateData: {},
                config: {
                    long: { enabled: false },
                    short: { enabled: false },
                    stopAtCycle: false
                }
            });
        }
        
        // Asegura que los objetos de configuración existen antes de usarlos
        botState.config = botState.config || {};
        botState.config.long = botState.config.long || {};
        botState.config.short = botState.config.short || {};
        
        // Actualizar la configuración con los datos del frontend
        botState.config.long = { ...botState.config.long, ...config.long };
        botState.config.short = { ...botState.config.short, ...config.short };

        if (strategy === 'long') {
            botState.config.long.enabled = true;
            botState.config.short.enabled = false;
            botState.lstate = 'RUNNING';
            botState.sstate = 'STOPPED';
        } else if (strategy === 'short') {
            botState.config.long.enabled = false;
            botState.config.short.enabled = true;
            botState.sstate = 'RUNNING';
            botState.lstate = 'STOPPED';
        }

        botState.config.stopAtCycle = stopAtCycle;
        
        await botState.save();

        autobotLogic.log(`Estrategia Autobot ${strategy} activada.`, 'success');
        res.json({ success: true, message: 'Autobot strategy started.' });
    } catch (error) {
        console.error('Failed to start Autobot strategy:', error);
        res.status(500).json({ success: false, message: 'Failed to start Autobot strategy.' });
    }
});

// Ruta para detener el Autobot
app.post('/api/autobot/stop', async (req, res) => {
    try {
        const botState = await Autobot.findOne({});
        if (botState) {
            botState.lstate = 'STOPPED';
            botState.sstate = 'STOPPED';
            botState.config.long.enabled = false;
            botState.config.short.enabled = false;
            await botState.save();
            autobotLogic.log('Autobot strategy stopped by user.', 'info');
            res.json({ success: true, message: 'Autobot strategy stopped.' });
        } else {
            res.status(404).json({ success: false, message: 'Bot state not found.' });
        }
    } catch (error) {
        console.error('Failed to stop Autobot strategy:', error);
        res.status(500).json({ success: false, message: 'Failed to stop Autobot strategy.' });
    }
});

// Ruta de prueba principal para verificar que el servidor está funcionando
app.get('/', (req, res) => {
    res.send('Backend is running!');
});

// La función autobotStrategy.setIo(io) ya no es necesaria con la nueva arquitectura del ciclo.
// Puedes eliminarla.

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});