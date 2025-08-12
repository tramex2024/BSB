// autobotLogic.js

const Autobot = require('./models/Autobot');
const bitmartService = require('./services/bitmartService');
const { runLongStrategy, setDependencies: setLongDeps } = require('./longStrategy');
const { runShortStrategy, setDependencies: setShortDeps } = require('./shortStrategy');

let io;
let intervalId;
let botIsRunning = false;
let currentLState = 'STOPPED';
let currentSState = 'STOPPED';

let activeBotOrders = [];
let botConfiguration = {};
let AUTH_CREDS = {};

const TRADE_SYMBOL = 'BTC_USDT';

function setIo(socketIo) {
    io = socketIo;
}

function log(message, type = 'info') {
    if (io) {
        io.emit('bot-log', { message, type, timestamp: new Date().toISOString() });
    }
    console.log(`[BOT LOG]: ${message}`);
}

async function updateBotState(lState, sState) {
    try {
        currentLState = lState;
        currentSState = sState;

        const autobot = await Autobot.findOne({});
        if (autobot) {
            autobot.lstate = lState;
            autobot.sstate = sState;
            await autobot.save();
        }

        if (io) {
            io.emit('bot-state-update', { lstate: currentLState, sstate: currentSState });
        }
    } catch (error) {
        log(`Error al actualizar el estado del bot: ${error.message}`, 'error');
    }
}

async function botMainLoop() {
    if (!botIsRunning) return;

    try {
        const SYMBOL = botConfiguration.symbol || TRADE_SYMBOL;
        const autobotState = await Autobot.findOne({});
        if (!autobotState) {
            log('No se encontró el estado del bot en la base de datos. Deteniendo...', 'error');
            return stop();
        }

        const ticker = await bitmartService.getTicker(SYMBOL);
        if (!ticker || !ticker.last) {
            log(`No se pudo obtener el precio de ${SYMBOL}. Reintentando en el próximo ciclo.`, 'error');
            return;
        }
        const currentPrice = parseFloat(ticker.last);
        log(`Precio actual de ${SYMBOL}: $${currentPrice.toFixed(2)}`, 'info');

        const balanceInfo = await bitmartService.getBalance(AUTH_CREDS);
        const usdtBalance = balanceInfo.find(b => b.currency === 'USDT');
        const availableUSDT = usdtBalance ? parseFloat(usdtBalance.available || 0) : 0;
        const btcBalance = balanceInfo.find(b => b.currency === 'BTC');
        const availableBTC = btcBalance ? parseFloat(btcBalance.available || 0) : 0;

        if (io) {
            io.emit('balanceUpdate', { usdt: availableUSDT, btc: availableBTC });
        }

        // --- Lógica de la estrategia Long ---
        await runLongStrategy(autobotState, currentPrice, availableUSDT, availableBTC);
        
        // --- CÓDIGO MODIFICADO: Lógica de la estrategia Short ---
        await runShortStrategy(autobotState, currentPrice, availableUSDT, availableBTC);
        // --- FIN DEL CÓDIGO MODIFICADO ---

    } catch (error) {
        log(`Error en el ciclo del bot: ${error.message}`, 'error');
    }
}

async function start(config, authCreds) {
    if (botIsRunning) return log('El bot ya está en ejecución.', 'warning');
    
    botConfiguration = config;
    AUTH_CREDS = authCreds;
    
    const SYMBOL = botConfiguration.symbol || TRADE_SYMBOL;
    
    if (!botConfiguration || !AUTH_CREDS) {
        log('Error: Falta configuración o credenciales para iniciar el bot.', 'error');
        return;
    }

    try {
        let autobot = await Autobot.findOne({});
        if (!autobot) {
            autobot = new Autobot({
                userId: 'default_user',
                lstate: 'RUNNING',
                sstate: 'RUNNING',
                config: botConfiguration,
                lStateData: {
                    ppc: 0,
                    ac: 0,
                    orderCountInCycle: 0,
                    lastOrder: null,
                    pm: 0,
                    pc: 0,
                    pv: 0
                },
                sStateData: {
                    ppv: 0,
                    av: 0,
                    orderCountInCycle: 0,
                    lastOrder: null
                }
            });
        } else {
            autobot.lstate = 'RUNNING';
            autobot.sstate = 'RUNNING';
            autobot.config = botConfiguration;
        }
        await autobot.save();
    } catch (dbError) {
        log(`Error al guardar la configuración inicial en la DB: ${dbError.message}`, 'error');
        return;
    }

    botIsRunning = true;
    await updateBotState('RUNNING', 'RUNNING');
    log(`El bot ha iniciado correctamente para el símbolo ${SYMBOL}.`, 'success');
    
    setLongDeps(botConfiguration, AUTH_CREDS, activeBotOrders);
    setShortDeps(botConfiguration, AUTH_CREDS, activeBotOrders);

    intervalId = setInterval(botMainLoop, botConfiguration.interval || 5000);
}

async function stop() {
    if (!botIsRunning) return log('El bot ya está detenido.', 'warning');
    
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }

    try {
        if (activeBotOrders.length > 0) {
            log(`Cancelando las ${activeBotOrders.length} órdenes activas del bot...`, 'info');
            for (const orderId of activeBotOrders) {
                await bitmartService.cancelOrder(AUTH_CREDS, botConfiguration.symbol, orderId);
                log(`Orden ${orderId} cancelada.`, 'success');
            }
        }
        
        activeBotOrders = [];
    } catch (error) {
        log(`Error al cancelar órdenes: ${error.message}`, 'error');
    }

    botIsRunning = false;
    await updateBotState('STOPPED', 'STOPPED');
    log("El bot se ha detenido.", 'success');
}

module.exports = {
    setIo,
    start,
    stop,
    log,
    updateBotState
};