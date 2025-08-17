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
        const tickerData = await bitmartService.getTicker(botState.config.symbol);
        
        // Ahora, 'tickerData' ya es el objeto 'data', no necesitas .data
        if (!tickerData || !tickerData.last) {
            log('No se pudo obtener el precio del mercado. Reintentando en el próximo ciclo.', 'error');
            return;
        }
        const currentPrice = parseFloat(tickerData.last);

        // Obtener balances de la cuenta
        const balancesArray = await bitmartService.getAccountBalances({
            apiKey: process.env.BITMART_API_KEY,
            secretKey: process.env.BITMART_SECRET_KEY,
            apiMemo: process.env.BITMART_API_MEMO
        });
        
        // La función getBalance de bitmartService.js devuelve un array
        const usdtBalance = balancesArray.find(b => b.currency === 'USDT');
        const btcBalance = balancesArray.find(b => b.currency === 'BTC');

        if (!usdtBalance || !btcBalance) {
            log('No se pudieron obtener los balances de la cuenta. Reintentando en el próximo ciclo.', 'error');
            return;
        }

        const availableUSDT = parseFloat(usdtBalance.available);
        const availableBTC = parseFloat(btcBalance.available);

        log(`Ticker para ${botState.config.symbol} obtenido con éxito.`, 'success');

        // ... (el resto de tu código para emitir y ejecutar estrategias)
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