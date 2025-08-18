const Autobot = require('./models/Autobot');
const bitmartService = require('./services/bitmartService');
const { runLongStrategy, setDependencies: setLongDeps } = require('./src/longStrategy');
const { runShortStrategy, setDependencies: setShortDeps } = require('./src/shortStrategy');

let io;
let botIsRunning = false;

function setIo(socketIo) {
    io = socketIo;
}

function log(message, type = 'info') {
    if (io) {
        io.emit('bot-log', { message, type, timestamp: new Date().toISOString() });
    }
    console.log(`[BOT LOG]: ${message}`);
}

async function botCycle(currentPrice) {
    try {
        let botState = await Autobot.findOne({});
        if (!botState) {
            log('Estado del bot no encontrado. Deteniendo el ciclo...', 'error');
            return;
        }

        // Usa el precio del WebSocket que se pasa como argumento
        if (currentPrice === 'N/A') {
            log('No se pudo obtener el precio del mercado. Reintentando en el próximo ciclo.', 'error');
            return;
        }

        log(`Ticker para ${botState.config.symbol} obtenido con éxito. Precio: ${currentPrice}`, 'success');

        const balancesArray = await bitmartService.getAccountBalances({
            apiKey: process.env.BITMART_API_KEY,
            secretKey: process.env.BITMART_SECRET_KEY,
            apiMemo: process.env.BITMART_API_MEMO
        });
        
        const usdtBalance = balancesArray.find(b => b.currency === 'USDT');
        const btcBalance = balancesArray.find(b => b.currency === 'BTC');

        if (!usdtBalance || !btcBalance) {
            log('No se pudieron obtener los balances de la cuenta. Reintentando en el próximo ciclo.', 'error');
            return;
        }

        const availableUSDT = parseFloat(usdtBalance.available);
        const availableBTC = parseFloat(btcBalance.available);

        io.emit('wallet-balances', {
            USDT: { available: availableUSDT, frozen: parseFloat(usdtBalance.frozen) },
            BTC: { available: availableBTC, frozen: parseFloat(btcBalance.frozen) }
        });

        // Configura las dependencias para las estrategias
        const dependencies = {
            log,
            io,
            bitmartService,
            Autobot,
            currentPrice,
            availableUSDT,
            availableBTC,
            botState,
            bitmartCredentials: {
                apiKey: process.env.BITMART_API_KEY,
                secretKey: process.env.BITMART_SECRET_KEY,
                memo: process.env.BITMART_API_MEMO
            }
        };

        setLongDeps(dependencies);
        setShortDeps(dependencies);

        // Ejecuta la estrategia si está activa
        if (botState.lstate === 'RUNNING') {
            await runLongStrategy();
        } else if (botState.sstate === 'RUNNING') {
            await runShortStrategy();
        }
        
    } catch (error) {
        log(`Error en el ciclo principal del bot: ${error.message}`, 'error');
    }
}

// Ahora, las funciones start y stop no controlan el bucle, sino el estado del bot.
// El bucle se maneja en server.js
async function start() {
    log('El bot se ha iniciado. El ciclo lo controla server.js', 'success');
}

async function stop() {
    log('El bot se ha detenido. El ciclo lo controla server.js', 'success');
}

module.exports = {
    setIo,
    start,
    stop,
    log,
    botCycle,
};