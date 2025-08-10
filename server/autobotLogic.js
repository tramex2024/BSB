// autobotLogic.js

const Autobot = require('./models/Autobot'); // Importa el modelo de MongoDB
const bitmartService = require('./services/bitmartService'); // Asegúrate de que esta ruta sea correcta

// Credenciales de BitMart
const bitmartCredentials = {
    apiKey: process.env.BITMART_API_KEY,
    secretKey: process.env.BITMART_SECRET_KEY,
    apiMemo: process.env.BITMART_API_MEMO || ''
};

// Función de logging, simulando un envío al frontend
function log(message) {
    // Aquí podrías agregar la lógica para enviar el mensaje a tu frontend
    // a través de WebSockets o guardarlo en una colección de logs de MongoDB.
    // Por ahora, solo lo mostrará en la consola.
    console.log(`[AUTOBOT LOG]: ${message}`);
}

// --- Ciclo de vida principal del Autobot ---
async function start() {
    log("Autobot strategy has started on the backend!");

    try {
        // 1. Verify BitMart API keys
        const isValid = await bitmartService.validateApiKeys(
            bitmartCredentials.apiKey,
            bitmartCredentials.secretKey,
            bitmartCredentials.apiMemo
        );

        if (!isValid) {
            log('Error: BitMart API keys are not valid. Stopping the bot.');
            await stop();
            return;
        }
        
        log("API keys validated successfully. Connection to BitMart established.");

        // 2. Load and update bot configuration from MongoDB
        let autobotConfig = await Autobot.findOne({});
        if (!autobotConfig) {
            log('No bot configuration found, creating a new one...');
            autobotConfig = new Autobot({
                lstate: 'RUNNING',
                sstate: 'RUNNING',
                longConfig: { purchase: 5, increment: 100, trigger: 1.5 },
                shortConfig: { purchase: 5, increment: 100, trigger: 1.5 }
            });
            await autobotConfig.save();
        } else {
            autobotConfig.lstate = 'RUNNING';
            autobotConfig.sstate = 'RUNNING';
            await autobotConfig.save();
        }

        log(`Autobot state updated in DB: Long state: ${autobotConfig.lstate}, Short state: ${autobotConfig.sstate}`);
        
        // 3. Start the trading loop
        runTradingLoop(autobotConfig);

    } catch (error) {
        log(`Error starting the Autobot: ${error.message}`);
        await stop();
    }
}

// Función para detener el bot y actualizar su estado en la DB
async function stop() {
    log('Stopping the bot...');
    try {
        const autobotConfig = await Autobot.findOne({});
        if (autobotConfig) {
            autobotConfig.lstate = 'STOPPED';
            autobotConfig.sstate = 'STOPPED';
            await autobotConfig.save();
            log('Autobot state updated to STOPPED in the DB.');
        }
    } catch (error) {
        log(`Error stopping the bot and saving to DB: ${error.message}`);
    }
}

// Función para el bucle de trading. Aquí se procesarán las señales.
function runTradingLoop(autobotConfig) {
    log('Trading loop initiated. Waiting for signals...');

    // Simularemos la espera de señales con un temporizador.
    const signalInterval = setInterval(() => {
        log(`Bot is running... waiting for signals (Long and Short).`);
    }, 30000); // Se ejecuta cada 30 segundos

    module.exports.intervalId = signalInterval;
}

// Exporta las funciones para que puedan ser llamadas desde server.js
module.exports = {
    start,
    stop,
    // La función 'log' también se exporta para su uso futuro
    log
};