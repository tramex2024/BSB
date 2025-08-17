const Autobot = require('./models/Autobot');
const bitmartService = require('./services/bitmartService');
const { runLongStrategy, setDependencies: setLongDeps } = require('./src/longStrategy');
const { runShortStrategy, setDependencies: setShortDeps } = require('./src/shortStrategy');

let io;
let intervalId;
let botIsRunning = false;

// Esta función es solo para iniciar la comunicación con Socket.io.
// El ciclo del bot se inicia desde el endpoint del servidor.
function setIo(socketIo) {
    io = socketIo;
}

function log(message, type = 'info') {
    if (io) {
        io.emit('bot-log', { message, type, timestamp: new Date().toISOString() });
    }
    console.log(`[BOT LOG]: ${message}`);
}

async function botCycle() {
    try {
        let botState = await Autobot.findOne({});
        if (!botState) {
            log('Estado del bot no encontrado. Deteniendo el ciclo...', 'error');
            return stop();
        }

        // Obtener datos del mercado
        const ticker = await bitmartService.getTicker(botState.config.symbol);
        if (!ticker || !ticker.data || !ticker.data.last) {
            log('No se pudo obtener el precio del mercado. Reintentando en el próximo ciclo.', 'error');
            return;
        }
        const currentPrice = parseFloat(ticker.data.last);

        // Obtener balances de la cuenta
        const balances = await bitmartService.getAccountBalances({
            apiKey: process.env.BITMART_API_KEY,
            secretKey: process.env.BITMART_SECRET_KEY,
            apiMemo: process.env.BITMART_API_MEMO
        });
        if (!balances || !balances.USDT || !balances.BTC) {
            log('No se pudieron obtener los balances de la cuenta. Reintentando en el próximo ciclo.', 'error');
            return;
        }
        const availableUSDT = parseFloat(balances.USDT.available);
        const availableBTC = parseFloat(balances.BTC.available);

        log(`Ticker para ${botState.config.symbol} obtenido con éxito.`, 'success');

        // Emitir datos al frontend en tiempo real
        if (io) {
            io.emit('marketData', {
                price: currentPrice.toFixed(2),
                usdt: availableUSDT.toFixed(2),
                btc: availableBTC.toFixed(8)
            });
        }

        // Pasar dependencias a las estrategias
        setLongDeps(botState.config, {
            apiKey: process.env.BITMART_API_KEY,
            secretKey: process.env.BITMART_SECRET_KEY,
            apiMemo: process.env.BITMART_API_MEMO
        }, []);
        setShortDeps(botState.config, {
            apiKey: process.env.BITMART_API_KEY,
            secretKey: process.env.BITMART_SECRET_KEY,
            apiMemo: process.env.BITMART_API_MEMO
        }, []);

        // Ejecutar las estrategias si están habilitadas
        if (botState.config.long.enabled) {
            await runLongStrategy(botState, currentPrice, availableUSDT, availableBTC);
        }
        if (botState.config.short.enabled) {
            await runShortStrategy(botState, currentPrice, availableUSDT, availableBTC);
        }

    } catch (error) {
        log(`Error en el ciclo principal del bot: ${error.message}`, 'error');
    }
}

async function start() {
    if (botIsRunning) {
        log('El bot ya está en ejecución.', 'warning');
        return;
    }
    
    botIsRunning = true;
    log("El bot se ha iniciado.", 'success');
    
    intervalId = setInterval(botCycle, 5000); // Se ejecuta cada 5 segundos
}

async function stop() {
    if (!botIsRunning) {
        log('El bot ya está detenido.', 'warning');
        return;
    }

    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }

    botIsRunning = false;
    log("El bot se ha detenido.", 'success');
}

module.exports = {
    setIo,
    start,
    stop,
    log,
    // La función botCycle es necesaria para el setInterval
    botCycle, 
};