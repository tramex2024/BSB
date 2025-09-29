// BSB/server/autobotLogic.js (CORREGIDO)

const Autobot = require('./models/Autobot');
const bitmartService = require('./services/bitmartService');
const { runLongStrategy, setDependencies: setLongDeps } = require('./src/longStrategy');
const { runShortStrategy, setDependencies: setShortDeps } = require('./src/shortStrategy');
// Ya no necesitamos calculateLongCoverage/Short aquí, ya que server.js lo hace.

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

/**
 * CICLO DE ESTRATEGIA (DISPARO RÁPIDO): Recibe el precio en tiempo real del WebSocket.
 * SOLO debe ejecutar la lógica de trading (runLongStrategy, etc.).
 */
async function botCycle(priceFromWebSocket) {
    try {
        let botState = await Autobot.findOne({});
        
        // 1. NORMALIZACIÓN DEL PRECIO (CORRECCIÓN CLAVE)
        const currentPrice = parseFloat(priceFromWebSocket); // Aseguramos que sea un número flotante

        // 2. Comprobación de precio y estado
        if (!botState || isNaN(currentPrice) || currentPrice <= 0) {
            // Solo loggeamos el error si el precio no es válido o si el botState no existe.
            if (priceFromWebSocket !== 'N/A') { 
                log(`Precio recibido no válido o botState no encontrado. Precio: ${priceFromWebSocket}`, 'warning');
            }
            return;
        }
        
        // **OPCIÓN TEMPORAL: Recuperar balances para inyección (Esto debe ser movido a balanceCycle)**
        const balancesArray = await bitmartService.getBalance({
            apiKey: process.env.BITMART_API_KEY,
            secretKey: process.env.BITMART_SECRET_KEY,
            apiMemo: process.env.BITMART_API_MEMO
        });
        const usdtBalance = balancesArray.find(b => b.currency === 'USDT');
        const btcBalance = balancesArray.find(b => b.currency === 'BTC');

        const availableUSDT = parseFloat(usdtBalance?.available || 0);
        const availableBTC = parseFloat(btcBalance?.available || 0);

        const dependencies = {
            log,
            io,
            bitmartService,
            Autobot,
            currentPrice, // Ahora es un número garantizado
            availableUSDT, 
            availableBTC, 
            botState,
            updateBotState, // Inyectamos las funciones de estado
            updateLStateData,
            bitmartCredentials: {
                apiKey: process.env.BITMART_API_KEY,
                secretKey: process.env.BITMART_SECRET_KEY,
                memo: process.env.BITMART_API_MEMO
            }
        };

        setLongDeps(dependencies);
        setShortDeps(dependencies);

        if (botState.lstate !== 'STOPPED') { // Solo corre la estrategia si está activa
            await runLongStrategy();
        }
        if (botState.sstate !== 'STOPPED') {
            // await runShortStrategy();
        }
    } catch (error) {
        // Tu anterior error de log ya no ocurrirá, pero loggeamos el nuevo.
        log(`Error en el ciclo principal del bot: ${error.message}`, 'error');
    }
}

/**
 * CICLO DE BALANCES (DISPARO LENTO): Obtiene balances y los emite al frontend.
 */
async function balanceCycle() {
    try {
        const balancesArray = await bitmartService.getBalance({
            apiKey: process.env.BITMART_API_KEY,
            secretKey: process.env.BITMART_SECRET_KEY,
            apiMemo: process.env.BITMART_API_MEMO
        });
        
        const usdtBalance = balancesArray.find(b => b.currency === 'USDT');
        const btcBalance = balancesArray.find(b => b.currency === 'BTC');

        if (!usdtBalance || !btcBalance) {
            log('No se pudieron obtener los balances de la cuenta.', 'error');
            return;
        }

        // Emitir al frontend para actualizar la UI
        io.emit('wallet-balances', {
            USDT: { available: parseFloat(usdtBalance.available), frozen: parseFloat(usdtBalance.frozen) },
            BTC: { available: parseFloat(btcBalance.available), frozen: parseFloat(btcBalance.frozen) }
        });

    } catch (error) {
        log(`Error en el ciclo de balances: ${error.message}`, 'error');
    }
}

// BSB/server/autobotLogic.js (RESTORE THE FOLLOWING FUNCTIONS)

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
        // No es necesario loguear en cada actualización de dato
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

// **AGREGA BALANCE CYCLE A LAS EXPORTACIONES**
module.exports = {
    setIo,
    start,
    stop,
    log,
    botCycle,        // Ciclo RÁPIDO (Estrategia)
    balanceCycle,    // Ciclo LENTO (Balances)
    updateBotState,
    updateLStateData
};