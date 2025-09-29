// BSB/server/autobotLogic.js
// Contiene la lógica del ciclo de trading del bot en el backend.

const Autobot = require('./models/Autobot');
const bitmartService = require('./services/bitmartService');
const { runLongStrategy, setDependencies: setLongDeps } = require('./src/longStrategy');
const { runShortStrategy, setDependencies: setShortDeps } = require('./src/shortStrategy');
const { calculateLongCoverage, calculateShortCoverage } = require('./autobotCalculations');

let io;

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

        if (currentPrice === 'N/A') {
            log('No se pudo obtener el precio del mercado. Reintentando en el próximo ciclo.', 'error');
            return;
        }

        const balancesArray = await bitmartService.getBalance({
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

        // Este código ya no es necesario aquí, ya que se encarga server.js
        /*
        const { coveragePrice: newLCoverage, numberOfOrders: newLNOrder } = calculateLongCoverage(
            botState.lbalance,
            parseFloat(currentPrice),
            botState.config.long.purchaseUsdt,
            botState.config.long.price_var / 100,
            botState.config.long.size_var / 100
        );
        const { coveragePrice: newSCoverage, numberOfOrders: newSNOrder } = calculateShortCoverage(
            botState.sbalance,
            parseFloat(currentPrice),
            botState.config.short.sellBtc,
            botState.config.short.price_var / 100,
            botState.config.short.size_var / 100
        );
        botState.lcoverage = newLCoverage;
        botState.lnorder = newLNOrder;
        botState.scoverage = newSCoverage;
        botState.snorder = newSNOrder;
        await botState.save();
        */

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

        if (botState.lstate === 'RUNNING') {
            await runLongStrategy();
        }
        if (botState.sstate === 'RUNNING') {
            // await runShortStrategy();
        }
    } catch (error) {
        log(`Error en el ciclo principal del bot: ${error.message}`, 'error');
    }
}

/**
 * Función que actualiza únicamente el estado principal del bot (lstate/sstate).
 * @param {string} newState - El nuevo estado a establecer.
 * @param {string} strategy - 'long' o 'short'.
 */
async function updateBotState(newState, strategy) {
    try {
        const updateField = strategy === 'long' ? 'lstate' : 'sstate';
        await Autobot.findOneAndUpdate({}, { [updateField]: newState });
        log(`Estado de la estrategia ${strategy} actualizado a: ${newState}`, 'info');
    } catch (error) {
        log(`Error al actualizar el estado: ${error.message}`, 'error');
    }
}

/**
 * Función que actualiza únicamente los datos del ciclo Long (lStateData) en la base de datos.
 * @param {object} lStateData - El objeto lStateData actualizado con nuevos precios/montos.
 */
async function updateLStateData(lStateData) {
    try {
        await Autobot.findOneAndUpdate({}, { lStateData: lStateData });
        // No es necesario loguear en cada actualización de dato, ya que ocurre a menudo
    } catch (error) {
        log(`Error al guardar lStateData: ${error.message}`, 'error');
    }
}

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
    updateBotState,      
    updateLStateData
};